import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { callFunction } from '../services/api';

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

// 🟢 NEW: Resonance Interfaces
export interface ResonanceMatch {
    source_file: string;
    type: 'PLOT_SEED' | 'VIBE_SEED' | 'LORE_SEED';
    crumb_text: string;
    similarity_score: number;
}

export interface StructureAnalysis {
    detected_phase?: "SETUP" | "INCITING_INCIDENT" | "RISING_ACTION" | "MIDPOINT" | "CRISIS" | "CLIMAX" | "RESOLUTION";
    confidence?: number;
    advice?: string;
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
    const [resonanceMatches, setResonanceMatches] = useState<ResonanceMatch[]>([]); // 🟢
    const [structureAnalysis, setStructureAnalysis] = useState<StructureAnalysis | null>(null); // 🟢

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
    const executeAudit = useCallback(async (textToAudit: string, isManual: boolean = false) => {
        if (!textToAudit || textToAudit.length < 50) return;

        if (textToAudit.length > MAX_AI_INPUT_CHARS) {
             console.warn(`🛡️ Guardian: Content exceeds limit (${textToAudit.length}/${MAX_AI_INPUT_CHARS}). Truncating scan.`);
             textToAudit = textToAudit.substring(0, MAX_AI_INPUT_CHARS);
        }

        setStatus('scanning');
        if (isManual) toast.loading("Iniciando escaneo de seguridad...", { id: 'guardian-audit' });

        try {
            const data = await callFunction<{
                success: boolean,
                status?: string,
                message?: string,
                facts: GuardianFact[],
                conflicts: GuardianConflict[],
                world_law_violations?: GuardianLawConflict[],
                personality_drift?: GuardianPersonalityDrift[],
                resonance_matches?: ResonanceMatch[], // 🟢
                structure_analysis?: StructureAnalysis // 🟢
            }>('auditContent', {
                content: textToAudit,
                projectId: projectId || 'global',
                fileId: fileId
            }, { timeout: 600000 }); // 10 Minutes

            if (data.success) {
                if (data.status === 'skipped_unchanged') {
                    // 🟢 PERSIST CURRENT STATE if skipped
                    // Just return, assuming state hasn't changed.
                    const hasExistingIssues = conflicts.length > 0 || lawConflicts.length > 0 || personalityDrifts.length > 0;
                    setStatus(hasExistingIssues ? 'conflict' : 'clean');
                    if (isManual) toast.success("Canon verificado (Sin cambios)", { id: 'guardian-audit' });
                    return;
                }

                setFacts(data.facts || []);
                setConflicts(data.conflicts || []);
                const laws = data.world_law_violations || [];
                setLawConflicts(laws);
                const drifts = data.personality_drift || [];
                setPersonalityDrifts(drifts);
                setResonanceMatches(data.resonance_matches || []); // 🟢
                setStructureAnalysis(data.structure_analysis || null); // 🟢

                const hasConflict = (data.conflicts && data.conflicts.length > 0) || laws.length > 0 || drifts.length > 0;
                setStatus(hasConflict ? 'conflict' : 'clean');

                if (hasConflict) {
                    const msg = `⚠️ ${data.conflicts.length + laws.length + drifts.length} anomalías detectadas por el Guardián.`;
                    if (isManual) toast.error(msg, { id: 'guardian-audit' });
                    else toast.error(msg);
                } else {
                    if (isManual) toast.success("Canon verificado: Todo en orden.", { id: 'guardian-audit' });
                }
            } else {
                setStatus('error');
                // Handle Safety Blocks
                if (data.status === 'content_blocked') {
                    const msg = "Contenido bloqueado por filtros de seguridad de IA.";
                    if (isManual) toast.error(msg, { id: 'guardian-audit', description: "Revisa el texto por contenido sensible." });
                    else toast.error(msg);
                } else if (isManual) {
                     toast.error(data.message || "Error en la auditoría.", { id: 'guardian-audit' });
                }
            }
        } catch (error) {
            console.error("Guardian Audit Failed:", error);
            setStatus('error');
            if (isManual) toast.error("Error de conexión con el Guardián.", { id: 'guardian-audit' });
        }
    }, [projectId, fileId, conflicts.length, lawConflicts.length, personalityDrifts.length]);

    // 🟢 DEBOUNCE LOOP (3000ms)
    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);

        if (!content || content.length < 50) {
            setStatus('idle');
            return;
        }

        timerRef.current = setTimeout(async () => {
            const currentHash = await computeHash(content);

            if (currentHash === lastHashRef.current) {
                console.log("🛡️ Guardian: Content unchanged (Hash Match). Skipping.");
                return;
            }

            lastHashRef.current = currentHash;
            executeAudit(content);

        }, 3000);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [content, executeAudit]);

    // 🟢 FORCE AUDIT TRIGGER
    const forceAudit = () => {
        if (timerRef.current) clearTimeout(timerRef.current);

        if (!content || content.length < 50) {
            toast.info("El Guardián necesita más contexto (mínimo 50 caracteres).");
            return;
        }

        executeAudit(content, true);
    };

    return {
        status,
        facts,
        conflicts,
        lawConflicts,
        personalityDrifts,
        resonanceMatches, // 🟢
        structureAnalysis, // 🟢
        forceAudit
    };
}
