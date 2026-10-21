/*
 * Este software y su código fuente son propiedad intelectual de Deiner David Trelles Renteria.
 * Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
 */
// Oct 2026: selector de carpetas navegable (cualquier nivel de profundidad).
// Reemplaza la lista plana que solo mostraba carpetas del primer nivel.
import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2, X, Check } from 'lucide-react';
import { callFunction } from '../../services/api';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface PickerNode { id: string; name: string; mimeType?: string; }

export interface FolderPickerSection {
    label: string;
    tone: 'canon' | 'resources' | 'other';
    folders: PickerNode[];
}

interface FolderPickerModalProps {
    isOpen: boolean;
    title?: string;
    itemName: string;
    /** Id del elemento que se mueve (si es carpeta, no se puede elegir ella misma ni entrar en ella). */
    itemId: string;
    currentParentId?: string;
    sections: FolderPickerSection[];
    accessToken: string | null;
    isBusy?: boolean;
    onConfirm: (targetFolderId: string, targetFolderName: string) => void;
    onClose: () => void;
}

const extractFiles = (result: any): any[] => {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.files)) return result.files;
    return [];
};

const toneClass = {
    canon: 'text-emerald-500',
    resources: 'text-blue-400',
    other: 'text-titanium-500',
};

const FolderPickerModal: React.FC<FolderPickerModalProps> = ({
    isOpen, title = 'Mover a…', itemName, itemId, currentParentId, sections, accessToken, isBusy, onConfirm, onClose,
}) => {
    const [childrenMap, setChildrenMap] = useState<Record<string, PickerNode[]>>({});
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
    const [openIds, setOpenIds] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<PickerNode | null>(null);

    useEffect(() => {
        if (isOpen) { setSelected(null); setOpenIds(new Set()); }
    }, [isOpen, itemId]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const toggle = async (node: PickerNode) => {
        const next = new Set(openIds);
        if (next.has(node.id)) { next.delete(node.id); setOpenIds(next); return; }
        next.add(node.id);
        setOpenIds(next);
        if (childrenMap[node.id]) return;
        setLoadingIds(prev => new Set(prev).add(node.id));
        try {
            const result = await callFunction<any>('getFileSystemNodes', { folderId: node.id, accessToken });
            const folders = extractFiles(result).filter((f: any) => f.mimeType === FOLDER_MIME);
            setChildrenMap(prev => ({ ...prev, [node.id]: folders }));
        } catch {
            setChildrenMap(prev => ({ ...prev, [node.id]: [] }));
        } finally {
            setLoadingIds(prev => { const s = new Set(prev); s.delete(node.id); return s; });
        }
    };

    const renderNode = (node: PickerNode, depth: number): React.ReactNode => {
        if (node.id === itemId) return null; // no mover una carpeta dentro de sí misma
        const isOpenNode = openIds.has(node.id);
        const isLoading = loadingIds.has(node.id);
        const kids = childrenMap[node.id];
        const isCurrent = node.id === currentParentId;
        const isSelected = selected?.id === node.id;
        return (
            <div key={node.id}>
                <div
                    className={`flex items-center gap-1.5 py-1.5 pr-2 rounded-lg text-xs cursor-pointer transition-colors
                        ${isSelected ? 'bg-cyan-900/40 text-cyan-200' : isCurrent ? 'text-titanium-500' : 'text-titanium-300 hover:bg-titanium-800 hover:text-white'}`}
                    style={{ paddingLeft: `${depth * 14 + 6}px` }}
                    onClick={() => { if (!isCurrent) setSelected(node); }}
                    onDoubleClick={() => toggle(node)}
                >
                    <button
                        type="button"
                        className="shrink-0 w-4 h-4 flex items-center justify-center text-titanium-500 hover:text-cyan-400"
                        onClick={(e) => { e.stopPropagation(); toggle(node); }}
                        aria-label={isOpenNode ? 'Cerrar carpeta' : 'Abrir carpeta'}
                    >
                        {isLoading ? <Loader2 size={12} className="animate-spin text-cyan-500" />
                            : isOpenNode ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    {isOpenNode ? <FolderOpen size={13} className="text-amber-400 shrink-0" /> : <Folder size={13} className="text-amber-400 shrink-0" />}
                    <span className="truncate flex-1">{node.name}</span>
                    {isCurrent && <span className="text-[9px] uppercase tracking-wide text-titanium-600">aquí está</span>}
                    {isSelected && <Check size={12} className="text-cyan-400 shrink-0" />}
                </div>
                {isOpenNode && kids && kids.length === 0 && !isLoading && (
                    <div className="text-[10px] text-titanium-600 py-1" style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}>Sin subcarpetas</div>
                )}
                {isOpenNode && kids && kids.map(k => renderNode(k, depth + 1))}
            </div>
        );
    };

    const hasAny = sections.some(s => s.folders.length > 0);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl w-[22rem] max-w-[92vw] max-h-[75vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-titanium-800">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-titanium-200">{title}</p>
                        <p className="text-[10px] text-titanium-500 truncate max-w-[260px]">{itemName}</p>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-titanium-300" aria-label="Cerrar">
                        <X size={14} />
                    </button>
                </div>
                <p className="px-4 pt-2 text-[10px] text-titanium-500">Elige la carpeta destino. Usa la flecha para ver sus subcarpetas.</p>
                <div className="overflow-y-auto flex-1 p-2">
                    {sections.filter(s => s.folders.length > 0).map(section => (
                        <div key={section.label} className="mb-2">
                            <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${toneClass[section.tone]}`}>{section.label}</div>
                            {section.folders.map(f => renderNode(f, 0))}
                        </div>
                    ))}
                    {!hasAny && <p className="text-[11px] text-titanium-600 text-center py-4">No hay carpetas disponibles.</p>}
                </div>
                <div className="flex items-center gap-2 px-3 py-3 border-t border-titanium-800">
                    <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800">
                        Cancelar
                    </button>
                    <button
                        disabled={!selected || isBusy}
                        onClick={() => selected && onConfirm(selected.id, selected.name)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 truncate"
                    >
                        {isBusy && <Loader2 size={12} className="animate-spin" />}
                        {selected ? `Mover a «${selected.name}»` : 'Elige una carpeta'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FolderPickerModal;
