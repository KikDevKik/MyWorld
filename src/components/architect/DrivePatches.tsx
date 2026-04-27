import React, { useState } from 'react';
import { FileText, Check, X, Loader2, GitMerge, Edit2 } from 'lucide-react';
import { callFunction } from '../../services/api';
import { toast } from 'sonner';

interface DrivePatch {
    documentName: string;
    driveFileId: string | null;
    newRuleStatement: string;
    patchInstructions: string;
    status: 'pending' | 'approved' | 'rejected';
    resolvedItemCode?: string;
    createdAt?: string;
    appliedAt?: string;
}

interface Props {
    patches: DrivePatch[];
    sessionId: string | null;
    accessToken: string | null;
    onPatchesUpdate?: () => void;
}

export default function DrivePatches({ patches, sessionId, accessToken, onPatchesUpdate }: Props) {
    const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
    const [rejectingIndex, setRejectingIndex] = useState<number | null>(null);
    
    // Edit mode state
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editedStatement, setEditedStatement] = useState('');
    const [editedInstructions, setEditedInstructions] = useState('');

    const pendingPatches = patches.filter(p => p.status === 'pending');
    const approvedPatches = patches.filter(p => p.status === 'approved');
    const rejectedPatches = patches.filter(p => p.status === 'rejected');

    if (patches.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50 p-6">
                <GitMerge size={24} className="text-titanium-600" />
                <p className="text-titanium-500 text-sm text-center">
                    Los parches de Canon aparecerán aquí cuando el Arquitecto proponga cambios a tus documentos al resolver una disonancia.
                </p>
            </div>
        );
    }

    const handleApply = async (patch: DrivePatch, index: number, overrides?: {
        statement?: string;
        instructions?: string;
    }) => {
        if (!sessionId || !accessToken) {
            toast.error("Falta sesión o acceso a Drive.");
            return;
        }
        if (!patch.driveFileId) {
            toast.error(`No se encontró el ID de Drive para "${patch.documentName}". Verifica que el archivo esté indexado.`);
            return;
        }

        const finalStatement = overrides?.statement || patch.newRuleStatement;
        const finalInstructions = overrides?.instructions || patch.patchInstructions;

        setApplyingIndex(index);
        const toastId = toast.loading(`Aplicando cambio en "${patch.documentName}"...`);

        try {
            const result = await callFunction<{ success: boolean; updatedFileName?: string }>(
                'arquitectoApplyPatch',
                {
                    sessionId,
                    patchIndex: index,
                    driveFileId: patch.driveFileId,
                    documentName: patch.documentName,
                    newRuleStatement: finalStatement,
                    patchInstructions: finalInstructions,
                    accessToken
                }
            );

            if (result?.success) {
                toast.success(`✅ "${patch.documentName}" actualizado en Drive.`, { id: toastId });
                onPatchesUpdate?.();
            }
        } catch (e: any) {
            toast.error(`Error al aplicar el patch: ${e.message}`, { id: toastId });
        } finally {
            setApplyingIndex(null);
        }
    };

    const handleReject = async (patch: DrivePatch, index: number) => {
        if (!sessionId) return;
        setRejectingIndex(index);
        try {
            await callFunction<{ success: boolean }>('arquitectoRejectPatch', { sessionId, patchIndex: index });
            toast.success("Cambio rechazado. El documento no fue modificado.");
            onPatchesUpdate?.();
        } catch (e) {
            toast.error("Error al rechazar el patch.");
        } finally {
            setRejectingIndex(null);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Resumen */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-titanium-800 shrink-0">
                {pendingPatches.length > 0 && (
                    <span className="text-[11px] font-mono text-amber-400">
                        {pendingPatches.length} pendiente{pendingPatches.length !== 1 ? 's' : ''}
                    </span>
                )}
                {approvedPatches.length > 0 && (
                    <span className="text-[11px] font-mono text-emerald-500">
                        {approvedPatches.length} aplicado{approvedPatches.length !== 1 ? 's' : ''}
                    </span>
                )}
                {rejectedPatches.length > 0 && (
                    <span className="text-[11px] font-mono text-titanium-600">
                        {rejectedPatches.length} rechazado{rejectedPatches.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Lista de patches */}
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-titanium-800/30">
                {patches.map((patch, index) => (
                    <div
                        key={index}
                        className={`p-4 transition-colors ${
                            patch.status === 'approved' ? 'opacity-50' :
                            patch.status === 'rejected' ? 'opacity-30' : ''
                        }`}
                    >
                        {/* Archivo objetivo */}
                        <div className="flex items-center gap-2 mb-2">
                            <FileText size={12} className={
                                patch.status === 'approved' ? 'text-emerald-500' :
                                patch.status === 'rejected' ? 'text-titanium-600' :
                                patch.driveFileId ? 'text-cyan-500' : 'text-amber-400'
                            } />
                            <span className="text-[12px] font-mono text-titanium-400 truncate">
                                {patch.documentName}
                            </span>
                            {!patch.driveFileId && patch.status === 'pending' && (
                                <span className="text-[10px] text-amber-400/70 font-mono ml-auto shrink-0">
                                    sin ID de Drive
                                </span>
                            )}
                        </div>

                        {/* Modo Edición o Vista */}
                        {editingIndex === index ? (
                            <div className="flex flex-col gap-2 mb-3">
                                <div className="bg-titanium-900/50 border border-cyan-500/30 rounded-lg p-3">
                                    <p className="text-[11px] font-mono text-titanium-500 mb-1 uppercase tracking-wider">
                                        Nueva regla canónica (editable):
                                    </p>
                                    <textarea
                                        value={editedStatement}
                                        onChange={e => setEditedStatement(e.target.value)}
                                        className="w-full bg-transparent text-[13px] text-titanium-200 leading-relaxed resize-none focus:outline-none min-h-[60px] custom-scrollbar"
                                        autoFocus
                                    />
                                </div>
                                <div className="bg-titanium-900/30 border border-titanium-700/30 rounded-lg p-3">
                                    <p className="text-[11px] font-mono text-titanium-600 mb-1 uppercase tracking-wider">
                                        Instrucción de integración (editable):
                                    </p>
                                    <textarea
                                        value={editedInstructions}
                                        onChange={e => setEditedInstructions(e.target.value)}
                                        className="w-full bg-transparent text-[11px] text-titanium-400 italic resize-none focus:outline-none min-h-[40px] custom-scrollbar"
                                    />
                                </div>
                                <div className="flex gap-2 mt-1">
                                    <button
                                        onClick={() => {
                                            // Actualizar localmente el array patches, pero aquí 
                                            // simplemente usaremos estos valores al aplicar.
                                            // Como no mutamos el array global hasta que se apruebe, 
                                            // es mejor llamar a handleApply de inmediato.
                                            handleApply(patch, index, { statement: editedStatement, instructions: editedInstructions });
                                            setEditingIndex(null);
                                        }}
                                        disabled={applyingIndex === index}
                                        className="flex items-center justify-center gap-1.5 flex-1 text-[12px] px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                                    >
                                        {applyingIndex === index ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                        Guardar y Aplicar
                                    </button>
                                    <button
                                        onClick={() => setEditingIndex(null)}
                                        disabled={applyingIndex === index}
                                        className="flex-1 text-[12px] px-3 py-1.5 text-titanium-500 border border-titanium-700 rounded-lg hover:bg-titanium-800/30 transition-colors disabled:opacity-40"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Nueva regla propuesta */}
                                <div className="bg-titanium-900/50 border border-titanium-800/50 rounded-lg p-3 mb-3 group relative">
                                    <p className="text-[11px] font-mono text-titanium-500 mb-1 uppercase tracking-wider">
                                        Nueva regla canónica:
                                    </p>
                                    <p className="text-[13px] text-titanium-200 leading-relaxed">
                                        {patch.newRuleStatement}
                                    </p>
                                </div>

                                {/* Instrucción de integración */}
                                {patch.patchInstructions && patch.status === 'pending' && (
                                    <p className="text-[11px] text-titanium-600 italic mb-3">
                                        → {patch.patchInstructions}
                                    </p>
                                )}

                                {/* Botones de acción */}
                                {patch.status === 'pending' && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleApply(patch, index)}
                                            disabled={applyingIndex === index || rejectingIndex === index || !patch.driveFileId}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[12px] font-medium rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {applyingIndex === index
                                                ? <Loader2 size={12} className="animate-spin" />
                                                : <Check size={12} />
                                            }
                                            {applyingIndex === index ? 'Aplicando...' : 'Aplicar en Drive'}
                                        </button>
                                        
                                        <button
                                            onClick={() => {
                                                setEditingIndex(index);
                                                setEditedStatement(patch.newRuleStatement);
                                                setEditedInstructions(patch.patchInstructions || '');
                                            }}
                                            disabled={applyingIndex === index || rejectingIndex === index}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-titanium-400 border border-titanium-700/50 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors disabled:opacity-40"
                                        >
                                            <Edit2 size={12} />
                                            Editar
                                        </button>

                                        <button
                                            onClick={() => handleReject(patch, index)}
                                            disabled={applyingIndex === index || rejectingIndex === index}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-titanium-500 border border-titanium-700/50 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors disabled:opacity-40"
                                        >
                                            {rejectingIndex === index
                                                ? <Loader2 size={12} className="animate-spin" />
                                                : <X size={12} />
                                            }
                                            Rechazar
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Estado final */}
                        {patch.status === 'approved' && (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-mono">
                                <Check size={11} />
                                Aplicado en Drive
                            </div>
                        )}
                        {patch.status === 'rejected' && (
                            <div className="flex items-center gap-1.5 text-[11px] text-titanium-700 font-mono">
                                <X size={11} />
                                Rechazado — documento sin cambios
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
