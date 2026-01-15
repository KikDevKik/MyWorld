import React from 'react';
import { X, ShieldAlert, CheckCircle, ScanEye, AlertTriangle, FileText, Zap, Skull, RefreshCw, Loader2 } from 'lucide-react';
import { GuardianConflict, GuardianFact, GuardianStatus, GuardianLawConflict, GuardianPersonalityDrift } from '../hooks/useGuardian';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useState, useMemo } from 'react';

interface CanonRadarProps {
    status: GuardianStatus;
    conflicts: GuardianConflict[];
    lawConflicts: GuardianLawConflict[];
    personalityDrifts?: GuardianPersonalityDrift[]; // New Prop
    facts: GuardianFact[];
    onClose: () => void;
    onForceAudit: () => void;
}

const CanonRadar: React.FC<CanonRadarProps & { accessToken?: string | null }> = ({ status, conflicts, lawConflicts = [], personalityDrifts = [], facts, onClose, onForceAudit, accessToken }) => {
    const functions = getFunctions();
    const updateForgeCharacter = httpsCallable(functions, 'updateForgeCharacter');
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

    // 🟢 SORTING LOGIC: TRAITOR (Critical) FIRST, then EVOLVED
    const sortedDrifts = useMemo(() => {
        return [...(personalityDrifts || [])].sort((a, b) => {
            if (a.status === 'TRAITOR' && b.status !== 'TRAITOR') return -1;
            if (a.status !== 'TRAITOR' && b.status === 'TRAITOR') return 1;
            return 0;
        });
    }, [personalityDrifts]);

    const handleSyncCanon = async (drift: GuardianPersonalityDrift) => {
        if (!accessToken) {
            alert("Error: No Access Token available for Sync.");
            return;
        }

        const charKey = drift.character;
        setSyncingIds(prev => new Set(prev).add(charKey));

        try {
            console.log("🔄 Syncing character...", drift);
            const traits = {
                // If it's "EVOLVED", the detected behavior is the NEW truth.
                // We update personality to reflect the new behavior and log it in evolution.
                evolution: `[Auto-Sync] Demonstrated behavior: ${drift.detected_behavior}`,
                personality: `[Updated] ${drift.detected_behavior}`
            };

            await updateForgeCharacter({
                characterId: drift.character.toLowerCase().replace(/\s+/g, '-'),
                newTraits: traits,
                rationale: `CanonRadar Auto-Sync: ${drift.hater_comment}`,
                accessToken: accessToken
            });

            // alert("✅ Personaje actualizado en La Forja."); // Too intrusive? Just rely on audit.
            onForceAudit(); // Re-scan to clear the alert
        } catch (e: any) {
            console.error("Sync Failed:", e);
            alert(`Error sincronizando: ${e.message}`);
        } finally {
            setSyncingIds(prev => {
                const next = new Set(prev);
                next.delete(charKey);
                return next;
            });
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-titanium-950/95 backdrop-blur-xl transition-all duration-300 shadow-2xl z-50">
            {/* HEADER */}
            <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-titanium-900/50">
                <div className="flex items-center gap-2 text-titanium-100">
                    <ScanEye className={`w-5 h-5 ${status === 'scanning' ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} />
                    <h2 className="font-bold text-sm tracking-widest uppercase">Radar de Canon</h2>
                </div>
                <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors" title="Cerrar Radar" aria-label="Cerrar Radar">
                    <X size={16} />
                </button>
            </div>

            {/* STATUS BANNER */}
            <div className={`
                p-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2
                ${status === 'scanning' ? 'bg-amber-900/20 text-amber-500' :
                  status === 'conflict' ? 'bg-red-900/20 text-red-500' :
                  status === 'clean' ? 'bg-emerald-900/20 text-emerald-500' :
                  'bg-titanium-900 text-titanium-500'}
            `}>
                {status === 'scanning' && <span>Analizando...</span>}
                {status === 'conflict' && <span>Divergencia Detectada</span>}
                {status === 'clean' && <span>Canon Estable</span>}
                {status === 'idle' && <span>En Espera</span>}
                {status === 'error' && <span>Error de Sistema</span>}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* 0. THE HATER (TRIGGER 3) - PERSONALITY DRIFTS */}
                {(sortedDrifts || []).length > 0 && (
                    <div className="space-y-3">
                         <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase mb-2 animate-pulse">
                            <Skull size={14} title="El Hater: Inconsistencia detectada" aria-label="El Hater: Inconsistencia de Personalidad Detectada" />
                            <span>Traición Narrativa ({(sortedDrifts || []).length})</span>
                        </div>

                        {(sortedDrifts || []).map((drift, idx) => {
                             const isSyncing = syncingIds.has(drift.character);
                             return (
                             <div key={`drift-${idx}`} className={`
                                border rounded-lg p-3 shadow-lg transition-colors relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500
                                ${drift.status === 'TRAITOR' ? 'bg-red-950/20 border-red-500/50 shadow-red-900/10' : 'bg-blue-950/20 border-blue-500/50 shadow-blue-900/10'}
                             `}>
                                {/* Header */}
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <span className="text-titanium-100 font-bold text-xs uppercase tracking-wide">{drift.character}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                        drift.status === 'TRAITOR' ? 'bg-red-600 text-white' : 'bg-blue-500 text-white'
                                    }`}>
                                        {drift.status}
                                    </span>
                                </div>

                                {/* Behavior */}
                                <div className="text-titanium-300 text-xs italic mb-2 border-l-2 border-titanium-700 pl-2">
                                    "{drift.detected_behavior}"
                                </div>

                                {/* Hater Comment */}
                                <div className="bg-black/40 rounded p-2 border border-titanium-800 relative mt-2">
                                    <div className="flex items-start gap-2">
                                        <Skull size={14} className="text-titanium-500 mt-0.5 shrink-0" title="Comentario del Crítico" aria-label="Comentario del Crítico" />
                                        <p className="text-titanium-400 text-[10px] font-mono leading-relaxed">
                                            {drift.hater_comment}
                                        </p>
                                    </div>
                                </div>

                                {/* SYNC ACTION (If Evolved) */}
                                {drift.status === 'EVOLVED' && (
                                    <button
                                        onClick={() => handleSyncCanon(drift)}
                                        disabled={isSyncing}
                                        className={`mt-3 w-full py-1.5 border text-[10px] font-bold uppercase rounded flex items-center justify-center gap-1.5 transition-all
                                            ${isSyncing
                                                ? 'bg-blue-950 border-blue-900 text-blue-500 cursor-wait'
                                                : 'bg-blue-900/30 hover:bg-blue-900/50 border-blue-800 text-blue-300'}
                                        `}
                                        aria-label="Sincronizar cambios en ficha"
                                    >
                                        {isSyncing ? (
                                            <>
                                                <Loader2 size={10} className="animate-spin" />
                                                <span>Sincronizando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw size={10} />
                                                <span>Actualizar Canon</span>
                                            </>
                                        )}
                                    </button>
                                )}
                             </div>
                        );})}
                    </div>
                )}

                {/* 1. REALITY FRACTURES (TRIGGER 2) */}
                {(lawConflicts || []).length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase mb-2 animate-pulse">
                            <Zap size={14} className="fill-amber-500/20" title="Fractura de Realidad" aria-label="Fractura de Realidad: Violación de Leyes del Mundo" />
                            <span>Fracturas de Realidad ({(lawConflicts || []).length})</span>
                        </div>

                        {(lawConflicts || []).map((item, idx) => (
                            <div key={`law-${idx}`} className="bg-amber-950/20 border border-amber-500/50 rounded-lg p-3 shadow-lg shadow-amber-900/10 hover:border-amber-400 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-amber-200 font-bold text-xs uppercase tracking-wide">{item.conflict.category} Violation</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                        item.severity === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'
                                    }`}>
                                        {item.severity}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {/* The Assertion */}
                                    <div className="text-titanium-300 text-xs italic border-l-2 border-amber-500/30 pl-2">
                                        "{item.conflict.assertion}"
                                    </div>

                                    {/* The Violation Explanation */}
                                    <div className="bg-black/40 rounded p-2 border border-amber-900/50">
                                        <div className="flex items-start gap-1.5">
                                            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" title="Explicación del conflicto" aria-label="Explicación del conflicto" />
                                            <p className="text-titanium-200 text-[11px] leading-relaxed">
                                                {item.conflict.explanation}
                                            </p>
                                        </div>
                                        {/* Canonical Rule Reference */}
                                        {item.conflict.canonical_rule && (
                                            <div className="mt-2 pt-2 border-t border-amber-900/30">
                                                <span className="text-[9px] text-amber-500/70 uppercase block mb-0.5">Regla Canónica:</span>
                                                <p className="text-titanium-400 text-[10px] font-mono">
                                                    {item.conflict.canonical_rule}
                                                </p>
                                            </div>
                                        )}
                                        {item.conflict.source_node && (
                                            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-titanium-500 justify-end">
                                                <FileText size={10} />
                                                <span>{item.conflict.source_node}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 2. CONFLICTS SECTION */}
                {(conflicts || []).length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase mb-2">
                            <ShieldAlert size={14} title="Conflicto detectado" aria-label="Conflicto detectado" />
                            <span>Conflictos Activos ({(conflicts || []).length})</span>
                        </div>

                        {(conflicts || []).map((conflict, idx) => (
                            <div key={idx} className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 shadow-sm hover:border-red-500/50 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-red-200 font-bold text-sm">{conflict.entity}</span>
                                    <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded uppercase">Contradicción</span>
                                </div>
                                <p className="text-titanium-200 text-xs italic mb-2">"{conflict.fact}"</p>

                                <div className="bg-black/40 rounded p-2 border-l-2 border-red-700">
                                    <div className="flex items-start gap-1.5">
                                        <AlertTriangle size={12} className="text-red-500 mt-0.5 shrink-0" />
                                        <p className="text-titanium-300 text-[11px] leading-relaxed">
                                            {conflict.conflict_reason}
                                        </p>
                                    </div>
                                    {conflict.source && (
                                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-titanium-500">
                                            <FileText size={10} />
                                            <span>Fuente: {conflict.source}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 3. VERIFIED FACTS SECTION */}
                {(facts || []).length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase mb-2">
                            <CheckCircle size={14} title="Hecho verificado" aria-label="Hecho verificado" />
                            <span>Hechos Verificados ({(facts || []).length})</span>
                        </div>

                        {(facts || []).map((fact, idx) => (
                            <div key={idx} className="bg-titanium-900/40 border border-titanium-800 rounded-lg p-3 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex justify-between items-center">
                                    <span className="text-titanium-200 font-medium text-xs">{fact.entity}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase border ${
                                        fact.status === 'new' ? 'border-blue-900 text-blue-400 bg-blue-900/20' :
                                        'border-emerald-900 text-emerald-400 bg-emerald-900/20'
                                    }`}>
                                        {fact.status === 'new' ? 'Nuevo' : 'Validado'}
                                    </span>
                                </div>
                                <p className="text-titanium-400 text-[11px]">{fact.fact}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* EMPTY STATE */}
                {status === 'clean' && (conflicts || []).length === 0 && (lawConflicts || []).length === 0 && (facts || []).length === 0 && (personalityDrifts || []).length === 0 && (
                    <div className="text-center py-10 opacity-50 flex flex-col items-center animate-in fade-in duration-700">
                        <ScanEye size={48} className="text-emerald-500/50 mb-4 animate-pulse" />
                        <h3 className="text-emerald-500 font-bold text-sm uppercase tracking-wider mb-2">Canon Estable</h3>
                        <p className="text-titanium-500 text-xs max-w-[200px]">
                            El Canon está en equilibrio. <br/>
                            Escribe con libertad.
                        </p>
                    </div>
                )}
            </div>

            {/* FOOTER ACTIONS */}
            <div className="p-4 border-t border-titanium-800 bg-titanium-900/50">
                <button
                    onClick={onForceAudit}
                    disabled={status === 'scanning'}
                    className="w-full py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Forzar análisis manual"
                    aria-label="Forzar análisis manual"
                >
                    <ScanEye size={14} />
                    {status === 'scanning' ? 'Analizando...' : 'Forzar Auditoría'}
                </button>
            </div>
        </div>
    );
};

export default CanonRadar;
