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

export type GuardianStatus = 'idle' | 'scanning' | 'clean' | 'conflict' | 'error';

export function useGuardian(content: string, projectId: string | null) {
    const [status, setStatus] = useState<GuardianStatus>('idle');
    const [facts, setFacts] = useState<GuardianFact[]>([]);
    const [conflicts, setConflicts] = useState<GuardianConflict[]>([]);

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
                projectId: projectId || 'global'
            });

            const data = result.data as { success: boolean, facts: GuardianFact[], conflicts: GuardianConflict[] };

            if (data.success) {
                setFacts(data.facts);
                setConflicts(data.conflicts);
                setStatus(data.conflicts.length > 0 ? 'conflict' : 'clean');

                if (data.conflicts.length > 0) {
                    toast.error(`⚠️ ${data.conflicts.length} conflictos detectados por el Guardián.`);
                }
            } else {
                setStatus('error');
            }
        } catch (error) {
            console.error("Guardian Audit Failed:", error);
            setStatus('error');
        }
    }, [projectId]);

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
        forceAudit
    };
}
