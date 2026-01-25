import { getFunctions, httpsCallable } from 'firebase/functions';
import { AnalysisCandidate } from '../types';
import { GraphNode } from '../../../types/graph';

// 🟢 HELPER: TOKEN VALIDATION (PING)
const validateToken = async (token: string): Promise<boolean> => {
    try {
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.ok;
    } catch (e) {
        console.warn(`[Token Check] Failed: ${e instanceof Error ? e.message : String(e)}`);
        return false;
    }
};

// Type definitions matching the context/backend
export interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
    path?: string; // Optional path if available
}

export type ScanProgressCallback = (status: string, progress: number, total: number) => void;

/**
 * Levenshtein Distance Implementation (Iterative)
 */
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Normalize Name Protocol
 * - Lowercase
 * - Remove Accents
 * - Remove special chars (-, _)
 */
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[-_]/g, "")
        .trim();
}

/**
 * Calculate Similarity (0.0 - 1.0)
 */
function calculateSimilarity(a: string, b: string): number {
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    return 1.0 - (distance / maxLength);
}

/**
 * Determines the context category based on file path/name
 */
function determineContextType(filePath: string): 'NARRATIVE' | 'WORLD_DEF' {
    const lower = filePath.toLowerCase();
    const worldKeywords = ['fichas', 'personajes', 'lore', 'ubicaciones', 'locations', 'characters', 'definitions', 'rules', 'reglas'];

    if (worldKeywords.some(k => lower.includes(k))) {
        return 'WORLD_DEF';
    }
    return 'NARRATIVE';
}

/**
 * Recursively extracts valid markdown files from the tree, filtering by Canon Paths
 */
function extractValidFiles(
    nodes: FileNode[],
    canonPathIds: Set<string>,
    isParentCanon: boolean = false,
    currentPath: string = '',
    parentId: string = 'root', // 🟢 NEW: Track Parent for Batching
    forceAll: boolean = false // 🟢 NEW: Fallback Protocol
): { id: string; name: string; fullPath: string; context: 'NARRATIVE' | 'WORLD_DEF'; parentId: string }[] {
    let results: any[] = [];

    for (const node of nodes) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

        // Check if this folder is a Canon Root (or if Force Protocol is active)
        const isCanon = forceAll || isParentCanon || canonPathIds.has(node.id);

        // 🟢 DEBUG LOGGING FOR ID MISMATCH
        if (node.mimeType === 'application/vnd.google-apps.folder' && !isCanon && !forceAll) {
             // Only log if it's a top-level rejection (parent wasn't canon either)
             if (!isParentCanon) {
                 console.log(`[NexusScanner] Skipping Folder: '${node.name}' (ID: ${node.id}). Not in Canon List.`);
             }
        }

        if (node.mimeType === 'application/vnd.google-apps.folder') {
            if (node.children) {
                // Pass current node ID as parentId for children
                // 🟢 RECURSION: Pass 'forceAll' down
                results = results.concat(extractValidFiles(node.children, canonPathIds, isCanon, nodePath, node.id, forceAll));
            }
        } else {
            // File Handling
            const isMarkdown = node.mimeType === 'text/markdown' ||
                               node.name.endsWith('.md') ||
                               node.mimeType === 'application/vnd.google-apps.document';

            // Strict Filter: Must be Markdown AND (Inside Canon Folder OR Explicitly Whitelisted)
            if (isMarkdown && isCanon) {
                results.push({
                    id: node.id,
                    name: node.name,
                    fullPath: nodePath,
                    context: determineContextType(nodePath),
                    parentId: parentId // 🟢 TRACK PARENT
                });
            }
        }
    }

    return results;
}

export const scanProjectFiles = async (
    projectId: string, // 🟢 NEW: Mandatory for Backend Context
    fileTree: FileNode[],
    canonConfigs: { id: string }[],
    existingNodes: GraphNode[],
    onProgress: ScanProgressCallback,
    ignoredTerms: string[] = []
): Promise<AnalysisCandidate[]> => {

    // 0. PRE-FLIGHT CHECK (TOKEN)
    const token = localStorage.getItem('google_drive_token');
    if (!token) throw new Error("No hay token de sesión.");

    // Validate connectivity before starting heavy operations
    const isTokenValid = await validateToken(token);
    if (!isTokenValid) {
        throw new Error("Sesión de Drive caducada. Reconecta en Configuración.");
    }

    // 1. Filter Files (Strict Mode)
    console.log(`[NexusScanner] Starting Scan. Configured Canon Paths: ${canonConfigs.length}`);
    const canonIds = new Set(canonConfigs.map(c => c.id));
    let targetFiles = extractValidFiles(fileTree, canonIds);

    // 🟢 FALLBACK PROTOCOL: If strict mode fails (ID Mismatch), engage "Trust the Tree" Mode
    if (targetFiles.length === 0 && fileTree.length > 0) {
        console.warn("NexusScanner: No valid canon files found in STRICT mode. Possible ID Mismatch (Shortcuts?). Engaging FALLBACK PROTOCOL (Force All).");
        onProgress("⚠️ Protocolo de Respaldo activado...", 0, 100);

        // Retry with forceAll = true
        targetFiles = extractValidFiles(fileTree, canonIds, false, '', 'root', true);
        console.log(`[NexusScanner] Fallback Scan yielded: ${targetFiles.length} files.`);
    }

    if (targetFiles.length === 0) {
        console.warn("NexusScanner: No valid canon files found (even with Fallback).");
        return [];
    }

    // 🟢 2. GROUPING (BATCHING STRATEGY)
    const batches: Record<string, typeof targetFiles> = {};
    targetFiles.forEach(f => {
        const pid = f.parentId || 'root';
        if (!batches[pid]) batches[pid] = [];
        batches[pid].push(f);
    });

    const batchKeys = Object.keys(batches);
    onProgress("Batching...", 0, batchKeys.length);

    // 3. Process Batches
    const functions = getFunctions();
    // 🟢 UPDATE: INCREASED TIMEOUT (9 Minutes)
    const analyzeFn = httpsCallable(functions, 'analyzeNexusFile', { timeout: 540000 });

    let allCandidates: AnalysisCandidate[] = [];
    let processedCount = 0;

    // Sequential Processing of Batches
    for (const pid of batchKeys) {
        const batchFiles = batches[pid];
        const batchIds = batchFiles.map(f => f.id);
        const contextType = batchFiles[0].context; // Assume batch shares context type (usually per folder)

        // 🟢 UI FEEDBACK: BICAMERAL PROTOCOL
        onProgress(`EJECUTANDO CEREBRO BICAMERAL (FLASH + PRO)... Analizando Lote ${processedCount + 1}/${batchKeys.length} (${batchFiles.length} archivos).`, processedCount, batchKeys.length);

        try {
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Missing Drive Token");

            const result = await analyzeFn({
                fileIds: batchIds, // 🟢 SEND LIST
                projectId: projectId, // 🟢 SEND PROJECT ID
                accessToken: token,
                contextType: contextType,
                ignoredTerms: ignoredTerms,
                folderId: pid
            });

            const data = result.data as { candidates: AnalysisCandidate[] };
            if (data.candidates && Array.isArray(data.candidates)) {
                // 🟢 ID GENERATION & RELATION MAPPING
                const candidatesWithIds = data.candidates.map(c => ({
                    ...c,
                    id: c.id || `cand-${Date.now()}-${Math.floor(Math.random() * 10000)}`
                }));
                allCandidates = [...allCandidates, ...candidatesWithIds];
            }

        } catch (err) {
            console.error(`[Scan Batch] Failed for Folder ${pid}: ${err instanceof Error ? err.message : String(err)}`);
        }

        processedCount++;
        onProgress(`Lote ${processedCount} completado.`, processedCount, batchKeys.length);
    }

    // 4. Cross-Reference (Local Levenshtein & Fuzzy Matching)
    onProgress("Cross-referencing...", batchKeys.length, batchKeys.length);

    const finalizedCandidates = allCandidates.map(candidate => {
        // 🟢 CRITICAL FIX: Resolve ID if AI Suggested Merge
        if (candidate.suggestedAction === 'MERGE' && candidate.mergeWithId) {
            // Try explicit ID match first, then Name match
            const targetName = normalizeName(candidate.mergeWithId);
            const match = existingNodes.find(n => n.id === candidate.mergeWithId || normalizeName(n.name) === targetName);

            if (match) {
                // Resolved to Real ID
                return {
                    ...candidate,
                    mergeWithId: match.id,
                    mergeTargetName: match.name // Cosmetic
                };
            } else {
                // Target not found -> Downgrade to Create (SafetyNet)
                return {
                    ...candidate,
                    suggestedAction: 'CREATE' as const,
                    ambiguityType: 'NEW' as const,
                    reasoning: candidate.reasoning + " [NEXUS: Objetivo de fusión no encontrado localmente, cambiado a CREAR]"
                };
            }
        }

        const normCandidate = normalizeName(candidate.name);

        // Check against Existing Nodes
        let bestMatch: GraphNode | null = null;
        let maxSim = 0;

        for (const node of existingNodes) {
            const normNode = normalizeName(node.name);
            const sim = calculateSimilarity(normCandidate, normNode);
            if (sim > maxSim) {
                maxSim = sim;
                bestMatch = node;
            }
        }

        // Threshold Logic: 85% Similarity
        if (bestMatch && maxSim > 0.85) {
            const pct = Math.round(maxSim * 100);
            return {
                ...candidate,
                ambiguityType: 'CONFLICT' as const,
                suggestedAction: 'MERGE' as const,
                mergeWithId: bestMatch.id,
                mergeTargetName: bestMatch.name, // 🟢 NEW: Store name for UI Cosmetic
                reasoning: `⚠️ Posible duplicado detectado (${pct}% similitud con '${bestMatch.name}'). Se sugiere FUSIÓN para consolidar evidencia.`
            };
        }

        return candidate;
    });

    return finalizedCandidates;
};
