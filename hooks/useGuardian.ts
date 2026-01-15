import { useState, useEffect, useCallback, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';

export interface GuardianFact {
    entity: string;
    fact: string;
    category: 'character' | 'location' | 'object' | 'world_rule';
    confidence: number;
    is_new_info: boolean;
    status: 'new' | 'verified';
}

export interface GuardianConflict {
    entity: string;
    fact: string;
    conflict_reason: string;
    source?: string;
    type: 'contradiction';
}

export interface GuardianLawConflict {
    trigger: "WORLD_LAW_VIOLATION";
    severity: "CRITICAL" | "WARNING" | "NONE";
    conflict: {
        category: "geography" | "chronology" | "system_rules";
        assertion: string;
        canonical_rule: string;
        source_node: string;
        explanation: string;
    };
}

export interface GuardianPersonalityDrift {
    trigger: "PERSONALITY_DRIFT";
    status: "CONSISTENT" | "EVOLVED" | "TRAITOR";
    severity: "CRITICAL" | "WARNING" | "INFO";
    hater_comment: string;
    detected_behavior: string;
    canonical_psychology: string;
    friccion_score: number;
    character: string;
}

export type GuardianStatus = 'idle' | 'scanning' | 'clean' | 'conflict' | 'error';

// 🛡️ LIMIT: 100k Characters (Client Side Check)
const MAX_AI_INPUT_CHARS = 100000;

export function useGuardian(content: string, projectId: string | null, fileId?: string) {
    const [status, setStatus] = useState<GuardianStatus>('idle');
    const [facts, setFacts] = useState<GuardianFact[]>([]);
    const [conflicts, setConflicts] = useState<GuardianConflict[]>([]);
    const [lawConflicts, setLawConflicts] = useState<GuardianLawConflict[]>([]);
    const [personalityDrifts, setPersonalityDrifts] = useState<GuardianPersonalityDrift[]>([]);

    // Internal State
    const lastHashRef = useRef<string>("");
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // 🟢 SHA-256 HASHING
    const computeHash = async (text: string) => {
        const msgBuffer = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // 🟢 AUDIT FUNCTION
    const executeAudit = useCallback(async (textToAudit: string) => {
        if (!textToAudit || textToAudit.length < 50) return;

        // 🛡️ CLIENT SIDE GUARD: LENGTH CHECK
        if (textToAudit.length > MAX_AI_INPUT_CHARS) {
             console.warn(`🛡️ Guardian: Content exceeds limit (${textToAudit.length}/${MAX_AI_INPUT_CHARS}). Truncating scan.`);
             // Option A: Abort
             // setStatus('error');
             // toast.error("Documento demasiado largo para análisis en tiempo real.");
             // return;

             // Option B: Scan only the first 100k (Safe Mode)
             textToAudit = textToAudit.substring(0, MAX_AI_INPUT_CHARS);
        }

        setStatus('scanning');

        try {
            const functions = getFunctions();
            const auditContent = httpsCallable(functions, 'auditContent');

            const result = await auditContent({
                content: textToAudit,
                projectId: projectId || 'global',
                fileId: fileId // Pass FileID for backend cache/history
            });

            const data = result.data as {
                success: boolean,
                status?: string,
                facts: GuardianFact[],
                conflicts: GuardianConflict[],
                world_law_violations?: GuardianLawConflict[],
                personality_drift?: GuardianPersonalityDrift[]
            };

            if (data.success) {
                if (data.status === 'skipped_unchanged') {
                    // Backend says no change (Double Check)
                    // If we have existing conflicts, stay red. If not, stay clean.
                    // Important: We shouldn't reset to clean if we had conflicts and just skipped.
                    // But if it skipped, it means the state hasn't changed.
                    // So we maintain the current visual state unless it was 'scanning'.
                    // Actually, if we are in 'scanning', we need to revert to previous state or re-calculate.
                    // But 'skipped_unchanged' implies the PREVIOUS result is still valid.
                    // Ideally, we should persist the result state.
                    // For now, let's assume if we skip, we go back to 'clean' or 'conflict' based on what we have in memory.
                    const hasExistingIssues = conflicts.length > 0 || lawConflicts.length > 0 || personalityDrifts.length > 0;
                    setStatus(hasExistingIssues ? 'conflict' : 'clean');
                    return;
                }

                setFacts(data.facts || []);
                setConflicts(data.conflicts || []);
                const laws = data.world_law_violations || [];
                setLawConflicts(laws);
                const drifts = data.personality_drift || [];
                setPersonalityDrifts(drifts);

                const hasConflict = (data.conflicts && data.conflicts.length > 0) || laws.length > 0 || drifts.length > 0;
                setStatus(hasConflict ? 'conflict' : 'clean');

                if (hasConflict) {
                    toast.error(`⚠️ ${data.conflicts.length + laws.length + drifts.length} anomalías detectadas por el Guardián.`);
                }
            } else {
                setStatus('error');
            }
        } catch (error) {
            console.error("Guardian Audit Failed:", error);
            setStatus('error');
        }
    }, [projectId, fileId, conflicts.length, lawConflicts.length, personalityDrifts.length]); // Dependencies adjusted

    // 🟢 DEBOUNCE LOOP (3000ms - Adjusted from 5s per plan)
    useEffect(() => {
        // Clear previous timer
        if (timerRef.current) clearTimeout(timerRef.current);

        // Don't scan empty stuff
        if (!content || content.length < 50) {
            setStatus('idle');
            return;
        }

        // Only set to 'idle' if we were 'clean' or 'error' or 'idle'.
        // If we are 'scanning', we are busy.
        // If we are 'conflict', we stay there until re-scan starts.
        // Actually, UI needs to know we are waiting to scan.
        // Let's not flicker 'idle' too much.
        // setStatus('idle');

        timerRef.current = setTimeout(async () => {
            const currentHash = await computeHash(content);

            // HASH CHECK (Rest Mode)
            if (currentHash === lastHashRef.current) {
                console.log("🛡️ Guardian: Content unchanged (Hash Match). Skipping.");
                return;
            }

            // Only update hash if we are actually going to scan (or attempt)
            lastHashRef.current = currentHash;
            executeAudit(content);

        }, 3000); // 3 Seconds Debounce

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [content, executeAudit]);

    // 🟢 FORCE AUDIT TRIGGER
    const forceAudit = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        executeAudit(content);
    };

    return {
        status,
        facts,
        conflicts,
        lawConflicts,
        personalityDrifts,
        forceAudit
    };
}
