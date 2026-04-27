import { AnalysisCandidate } from '../types';
import { GraphNode } from '../../../types/graph';

/**
 * Levenshtein Distance Implementation (Iterative)
 */
export function levenshteinDistance(a: string, b: string): number {
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
export function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[-_]/g, "")
        .trim();
}

/**
 * Calculate Similarity (0.0 - 1.0)
 */
export function calculateSimilarity(a: string, b: string): number {
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    return 1.0 - (distance / maxLength);
}

/**
 * ⚡ Bolt Optimization:
 * Resolves candidate matches using O(1) Map lookups for exact matches,
 * falling back to O(N) Levenshtein distance only when necessary.
 */
export const resolveCandidateMatches = (
    candidates: AnalysisCandidate[],
    existingNodes: GraphNode[]
): AnalysisCandidate[] => {
    // ⚡ Pre-compute normalized names and build O(1) Map
    const precomputedNodes = existingNodes.map(node => ({
        node,
        normName: normalizeName(node.name)
    }));

    // Create a Map for O(1) exact lookups
    // We iterate forward so first match wins if duplicates exist (matching original array scan behavior)
    const exactMatchMap = new Map<string, GraphNode>();
    for (const item of precomputedNodes) {
        if (!exactMatchMap.has(item.normName)) {
            exactMatchMap.set(item.normName, item.node);
        }
    }

    return candidates.map(candidate => {
        // 🟢 CRITICAL FIX: Resolve ID if AI Suggested Merge
        if (candidate.suggestedAction === 'MERGE' && candidate.mergeWithId) {
            // Try explicit ID match first, then Name match via Map (O(1))
            const targetName = normalizeName(candidate.mergeWithId);

            // Use Map for Name lookup instead of .find()
            const match = existingNodes.find(n => n.id === candidate.mergeWithId) ||
                          exactMatchMap.get(targetName);

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

        // ⚡ Optimization: Check Exact Match First (O(1))
        if (exactMatchMap.has(normCandidate)) {
            const bestMatch = exactMatchMap.get(normCandidate)!;

            // Exact match implies 100% similarity, so we force MERGE logic immediately
            return {
                ...candidate,
                ambiguityType: 'CONFLICT' as const,
                suggestedAction: 'MERGE' as const,
                mergeWithId: bestMatch.id,
                mergeTargetName: bestMatch.name, // 🟢 NEW: Store name for UI Cosmetic
                reasoning: `⚠️ Posible duplicado detectado (100% similitud con '${bestMatch.name}'). Se sugiere FUSIÓN para consolidar evidencia.`
            };
        }

        // Fallback: Fuzzy Search (O(N) loop)
        let bestMatch: GraphNode | null = null;
        let maxSim = 0;

        for (const { node, normName } of precomputedNodes) {
            // ⚡ Optimization: Length heuristic check
            // If length diff is > 30% of candidate length, similarity cannot exceed 70% (approx)
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
                if (maxSim === 1.0) break; // ⚡ Perfect match found (should be caught by Map above, but safety)
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
};
