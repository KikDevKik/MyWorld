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
        console.warn("Token validation failed (Network error):", e);
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
    currentPath: string = ''
): { id: string; name: string; fullPath: string; context: 'NARRATIVE' | 'WORLD_DEF' }[] {
    let results: any[] = [];

    for (const node of nodes) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

        // Check if this folder is a Canon Root
        const isCanon = isParentCanon || canonPathIds.has(node.id);

        if (node.mimeType === 'application/vnd.google-apps.folder') {
            if (node.children) {
                results = results.concat(extractValidFiles(node.children, canonPathIds, isCanon, nodePath));
            }
        } else {
            // File Handling
            const isMarkdown = node.mimeType === 'text/markdown' ||
                               node.name.endsWith('.md') ||
                               node.mimeType === 'application/vnd.google-apps.document'; // Allow Docs too if needed? User said .md filter primarily.

            // Strict Filter: Must be Markdown AND (Inside Canon Folder OR Explicitly Whitelisted)
            if (isMarkdown && isCanon) {
                results.push({
                    id: node.id,
                    name: node.name,
                    fullPath: nodePath,
                    context: determineContextType(nodePath)
                });
            }
        }
    }

    return results;
}

export const scanProjectFiles = async (
    fileTree: FileNode[],
    canonConfigs: { id: string }[],
    existingNodes: GraphNode[],
    onProgress: ScanProgressCallback,
    ignoredTerms: string[] = [] // 🟢 NEW: Passed from caller
): Promise<AnalysisCandidate[]> => {

    // 0. PRE-FLIGHT CHECK (TOKEN)
    const token = localStorage.getItem('google_drive_token');
    if (!token) throw new Error("No hay token de sesión.");

    // Validate connectivity before starting heavy operations
    const isTokenValid = await validateToken(token);
    if (!isTokenValid) {
        throw new Error("Sesión de Drive caducada. Reconecta en Configuración.");
    }

    // 1. Filter Files
    const canonIds = new Set(canonConfigs.map(c => c.id));
    const targetFiles = extractValidFiles(fileTree, canonIds);

    if (targetFiles.length === 0) {
        console.warn("NexusScanner: No valid canon files found.");
        return [];
    }

    // 2. Process Files
    const functions = getFunctions();
    const analyzeFn = httpsCallable(functions, 'analyzeNexusFile');

    let allCandidates: AnalysisCandidate[] = [];
    let processedCount = 0;

    // Sequential Processing
    for (const file of targetFiles) {
        onProgress(`Reading ${file.name}...`, processedCount, targetFiles.length);

        try {
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Missing Drive Token");

            const result = await analyzeFn({
                fileId: file.id,
                accessToken: token,
                contextType: file.context,
                ignoredTerms: ignoredTerms // 🟢 PASS TO BACKEND
            });

            const data = result.data as { candidates: AnalysisCandidate[] };
            if (data.candidates && Array.isArray(data.candidates)) {
                // 🟢 ID GENERATION: Ensure every candidate has a temporary ID for the UI
                const candidatesWithIds = data.candidates.map(c => ({
                    ...c,
                    id: c.id || `cand-${Date.now()}-${Math.floor(Math.random() * 10000)}`
                }));
                allCandidates = [...allCandidates, ...candidatesWithIds];
            }

        } catch (err) {
            console.error(`Error scanning ${file.name}:`, err);
        }

        processedCount++;
        onProgress(`Analyzed ${file.name}`, processedCount, targetFiles.length);
    }

    // 3. Cross-Reference (Local Levenshtein & Fuzzy Matching)
    onProgress("Cross-referencing...", targetFiles.length, targetFiles.length);

    const finalizedCandidates = allCandidates.map(candidate => {
        // Skip if already flagged as duplicate by AI (Law of Identity)
        if (candidate.ambiguityType === 'DUPLICATE') return candidate;

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
                reasoning: `⚠️ Posible duplicado detectado (${pct}% similitud con '${bestMatch.name}'). Se sugiere FUSIÓN para consolidar evidencia.`
            };
        }

        return candidate;
    });

    return finalizedCandidates;
};
