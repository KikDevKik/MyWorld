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
                    setStatus(conflicts.length > 0 ? 'conflict' : 'clean');
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
    }, [projectId, fileId]); // Depend on fileId too

    // 🟢 DEBOUNCE LOOP (5000ms)
    useEffect(() => {
        // Clear previous timer
        if (timerRef.current) clearTimeout(timerRef.current);

        // Don't scan empty stuff
        if (!content || content.length < 50) {
            setStatus('idle');
            return;
        }

        setStatus('idle'); // Waiting...

        timerRef.current = setTimeout(async () => {
            const currentHash = await computeHash(content);

            // HASH CHECK (Rest Mode)
            if (currentHash === lastHashRef.current) {
                console.log("🛡️ Guardian: Content unchanged (Hash Match). Skipping.");
                return;
            }

            lastHashRef.current = currentHash;
            executeAudit(content);

        }, 5000);

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
