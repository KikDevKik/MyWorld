import { AnalysisCandidate } from '../types';
import { GraphNode } from '../../../types/graph';
import { callFunction } from '../../../services/api';

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

// 🟢 HELPER: BATCH METADATA FETCH
const fetchFileMetadata = async (fileIds: string[], token: string): Promise<Record<string, { id: string, name: string, modifiedTime: string }>> => {
    const results: Record<string, { id: string, name: string, modifiedTime: string }> = {};
    const CHUNK_SIZE = 10; // 10 parallel requests to avoid rate limits

    for (let i = 0; i < fileIds.length; i += CHUNK_SIZE) {
        const chunk = fileIds.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (id) => {
            try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,modifiedTime`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    results[id] = { id: data.id, name: data.name, modifiedTime: data.modifiedTime };
                }
            } catch (e) {
                console.warn(`[NexusScanner] Metadata fetch failed for ${id}`, e);
            }
        }));
    }
    return results;
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

/**
 * Internal Consolidation Protocol
 * - Merges duplicate candidates found across different files/batches
 * - Combines evidence, confidence, and reasoning
 */
function consolidateIntraScanCandidates(candidates: AnalysisCandidate[]): AnalysisCandidate[] {
    const map = new Map<string, AnalysisCandidate>();

    for (const c of candidates) {
        const key = normalizeName(c.name);

        if (map.has(key)) {
            const existing = map.get(key)!;

            // 1. Merge Evidence (Unique by snippet/file)
            const existingEvidence = new Set(existing.foundInFiles?.map(e => e.fileName + e.contextSnippet) || []);
            const newEvidence = c.foundInFiles || [];

            for (const ev of newEvidence) {
                const sig = ev.fileName + ev.contextSnippet;
                if (!existingEvidence.has(sig)) {
                    if (!existing.foundInFiles) existing.foundInFiles = [];
                    existing.foundInFiles.push(ev);
                    existingEvidence.add(sig);
                }
            }

            // 2. Merge Relations
            if (c.relations) {
                if (!existing.relations) existing.relations = [];
                existing.relations.push(...c.relations);
            }

            // 3. Max Confidence
            existing.confidence = Math.max(existing.confidence, c.confidence);

            // 4. Combine Reasoning (if distinct)
            if (c.reasoning && !existing.reasoning.includes(c.reasoning)) {
                existing.reasoning += `\n\n[Fusionado]: ${c.reasoning}`;
            }

        } else {
            // Clone to avoid mutating original if needed
            map.set(key, { ...c, foundInFiles: c.foundInFiles ? [...c.foundInFiles] : [] });
        }
    }

    return Array.from(map.values());
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

    // 🟢 1.5. DIFFERENTIAL SCANNING (The Filter)
    onProgress("Verificando actualizaciones...", 0, targetFiles.length);
    const fileMetadataMap = await fetchFileMetadata(targetFiles.map(f => f.id), token);

    const filesToScan = targetFiles.filter(f => {
        const meta = fileMetadataMap[f.id];
        if (!meta) {
            console.warn(`[NexusScanner] Could not fetch metadata for ${f.name}, forcing scan.`);
            return true;
        }

        // Logic: Check if we have ALREADY processed this file version in ANY node
        const isRecorded = existingNodes.some(node => {
            const evidence = node.foundInFiles?.find(ev => ev.fileId === f.id);
            if (!evidence) return false;

            // If evidence is missing timestamp, it's old data -> re-scan
            if (!evidence.fileLastModified) return false;

            // Compare timestamps
            // If recorded >= current, we have seen this version.
            return new Date(evidence.fileLastModified).getTime() >= new Date(meta.modifiedTime).getTime();
        });

        if (isRecorded) {
            // console.log(`[NexusScanner] Skipping unchanged file: ${f.name}`);
            return false;
        }
        return true;
    });

    console.log(`[NexusScanner] Differential Analysis: ${filesToScan.length} files changed/new out of ${targetFiles.length}.`);

    if (filesToScan.length === 0) {
        onProgress("Todo está actualizado.", 100, 100);
        return [];
    }

    // 🟢 2. GROUPING (BATCHING STRATEGY)
    const batches: Record<string, typeof filesToScan> = {};
    filesToScan.forEach(f => {
        const pid = f.parentId || 'root';
        if (!batches[pid]) batches[pid] = [];
        batches[pid].push(f);
    });

    const batchKeys = Object.keys(batches);
    // onProgress("Batching...", 0, batchKeys.length);

    // 3. Process Batches
    let allCandidates: AnalysisCandidate[] = [];
    let processedCount = 0;

    // Sequential Processing of Batches
    for (const pid of batchKeys) {
        const batchFiles = batches[pid];
        const batchIds = batchFiles.map(f => f.id);
        const contextType = batchFiles[0].context; // Assume batch shares context type (usually per folder)

        // 🟢 UI FEEDBACK: BICAMERAL PROTOCOL
        onProgress(`ANALIZANDO NOVEDADES... Lote ${processedCount + 1}/${batchKeys.length} (${batchFiles.length} archivos).`, processedCount, batchKeys.length);

        try {
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Missing Drive Token");

            const data = await callFunction<{ candidates: AnalysisCandidate[] }>('analyzeNexusFile', {
                fileIds: batchIds, // 🟢 SEND LIST
                projectId: projectId, // 🟢 SEND PROJECT ID
                accessToken: token,
                contextType: contextType,
                ignoredTerms: ignoredTerms,
                folderId: pid
            }, { timeout: 540000 }); // 9 Minutes

            if (data.candidates && Array.isArray(data.candidates)) {
                // 🟢 ID GENERATION & RELATION MAPPING & METADATA INJECTION
                const candidatesWithIds = data.candidates.map(c => {
                    // Inject File Metadata using mapped name
                    const enhancedFoundInFiles = c.foundInFiles?.map(ev => {
                        // Robust Matching: Try exact first, then normalized
                        let matchFile = batchFiles.find(bf => bf.name === ev.fileName);
                        if (!matchFile) {
                             const normEv = normalizeName(ev.fileName);
                             matchFile = batchFiles.find(bf => normalizeName(bf.name) === normEv);
                        }
                        const meta = matchFile ? fileMetadataMap[matchFile.id] : null;

                        return {
                            ...ev,
                            fileId: meta?.id,
                            fileLastModified: meta?.modifiedTime
                        };
                    }) || [];

                    return {
                        ...c,
                        id: c.id || `cand-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                        foundInFiles: enhancedFoundInFiles
                    };
                });
                allCandidates = [...allCandidates, ...candidatesWithIds];
            }

        } catch (err) {
            console.error(`[Scan Batch] Failed for Folder ${pid}: ${err instanceof Error ? err.message : String(err)}`);
        }

        processedCount++;
        onProgress(`Lote ${processedCount} completado.`, processedCount, batchKeys.length);
    }

    // 🟢 NEW: INTERNAL CONSOLIDATION (Fix for duplicates)
    allCandidates = consolidateIntraScanCandidates(allCandidates);

    // 🟢 HARDENING PROTOCOL: SAFETY FILTER (Blocklist)
    const BLOCKLIST_TERMS = [
        'tag', 'tier', 'subtype', 'faction', 'group', 'unknown', 'object', 'location',
        'character', 'undefined', 'null', 'nombre', 'name', 'titulo', 'title',
        'descripcion', 'description', 'rol', 'role', 'clase', 'class'
    ];

    allCandidates = allCandidates.filter(c => {
        const lowerName = c.name.toLowerCase().trim();

        // 1. Generic Term Check
        if (BLOCKLIST_TERMS.includes(lowerName)) {
            console.warn(`[NexusScanner] Blocked generic term: '${c.name}'`);
            return false;
        }

        // 2. File Extension Check
        if (lowerName.endsWith('.md') || lowerName.endsWith('.txt') || lowerName.endsWith('.json')) {
            console.warn(`[NexusScanner] Blocked file artifact: '${c.name}'`);
            return false;
        }

        // 3. Length Check
        if (lowerName.length < 2) {
            console.warn(`[NexusScanner] Blocked too short: '${c.name}'`);
            return false;
        }

        return true;
    });

    // 🟢 RESOLUTION & SANITATION PROTOCOL: Fix Edges
    // Map valid candidate names to IDs for internal linking
    const candidateIdMap = new Map<string, string>();
    allCandidates.forEach(c => {
        candidateIdMap.set(normalizeName(c.name), c.id);
    });

    // Map existing nodes for linking
    existingNodes.forEach(n => {
        candidateIdMap.set(normalizeName(n.name), n.id);
    });

    allCandidates = allCandidates.map(c => {
        if (!c.relations) return c;

        const validRelations = c.relations.map(rel => {
            // 1. Try to resolve Target ID if missing
            if (!rel.targetId && rel.target) {
                const targetId = candidateIdMap.get(normalizeName(rel.target));
                if (targetId) {
                    return { ...rel, targetId };
                }
            }
            // 2. Keep if it has a valid targetId (pre-existing or resolved)
            if (rel.targetId && candidateIdMap.values()) {
                 // Optimization: We could check if ID exists, but map values iteration is slow.
                 // Trusting resolution above.
                 return rel;
            }
            return rel; // Keep original for now, filter below
        }).filter(rel => {
            // 3. SANITATION: Only keep relations where we confirmed a Target ID
            // or if it looks like a valid external reference (optional, but for Graph it needs ID)
            // Strict Mode: Require targetId for visualization
            return !!rel.targetId;
        });

        return { ...c, relations: validRelations };
    });

    // 4. Cross-Reference (Local Levenshtein & Fuzzy Matching)
    onProgress("Integrando conocimientos...", batchKeys.length, batchKeys.length);

    // ⚡ Bolt Optimization: Pre-compute normalized names (O(N) vs O(C*N))
    const precomputedNodes = existingNodes.map(node => ({
        node,
        normName: normalizeName(node.name)
    }));

    const finalizedCandidates = allCandidates.map(candidate => {
        // 🟢 CRITICAL FIX: Resolve ID if AI Suggested Merge
        if (candidate.suggestedAction === 'MERGE' && candidate.mergeWithId) {
            // Try explicit ID match first, then Name match
            const targetName = normalizeName(candidate.mergeWithId);
            // Use precomputed lookup for name match optimization? Or simpler .find is fine for this specific case (rare)
            // We can reuse precomputedNodes for name lookup if we want, but ID check is primary.
            const match = existingNodes.find(n => n.id === candidate.mergeWithId) ||
                          precomputedNodes.find(pn => pn.normName === targetName)?.node;

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

        for (const { node, normName } of precomputedNodes) {
            // ⚡ Optimization: Length heuristic check
            // If length diff is > 30% of candidate length, similarity cannot exceed 70% (approx)
            // Actually, Levenshtein distance >= |lenA - lenB|
            // So sim = 1 - dist/maxLen <= 1 - |lenA - lenB|/maxLen
            // If we need > 0.75, then |lenA - lenB|/maxLen < 0.25
            const lenA = normCandidate.length;
            const lenB = normName.length;
            const maxLen = Math.max(lenA, lenB);

            // Skip expensive Levenshtein if lengths are too different
            if (maxLen > 0 && Math.abs(lenA - lenB) / maxLen > 0.3) {
                continue;
            }

            const sim = calculateSimilarity(normCandidate, normName);

            if (sim > maxSim) {
                maxSim = sim;
                bestMatch = node;
                if (maxSim === 1.0) break; // ⚡ Perfect match found, stop searching
            }
        }

        // Threshold Logic: 75% Similarity (Aggressive)
        if (bestMatch && maxSim > 0.75) {
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
