import React, { useState, useEffect, useMemo } from 'react';
import {
    Printer,
    Download,
    FileText,
    Folder,
    ChevronRight,
    ChevronDown,
    CheckSquare,
    Square,
    Loader2,
    BookOpen,
    Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import { CreativeAuditService } from '../services/CreativeAuditService';
import { callFunction } from '../services/api';

interface ExportPanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

// --- TYPES ---
interface ExportOptions {
    includeCover: boolean;
    includeToc: boolean;
    pageBreakPerFile: boolean;
    smartBreaks: boolean; // 👈 NEW: Auto-Detect Chapters
}

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
    driveId?: string;
}

// --- HELPER: FLATTEN TREE FOR ID LOOKUP ---
const getAllDescendantIds = (node: FileNode): string[] => {
    let ids: string[] = [];
    if (node.mimeType !== 'application/vnd.google-apps.folder') {
        ids.push(node.id);
    }
    if (node.children) {
        node.children.forEach(child => {
            ids = [...ids, ...getAllDescendantIds(child)];
        });
    }
    return ids;
};

// --- COMPONENT: CHECKABLE TREE NODE ---
const CheckableTreeNode: React.FC<{
    node: FileNode;
    depth: number;
    selectedIds: Set<string>;
    onToggleSelect: (ids: string[], selected: boolean) => void;
}> = ({ node, depth, selectedIds, onToggleSelect }) => {
    const [isOpen, setIsOpen] = useState(depth < 1); // Auto-expand root
    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';

    // Calculation for Checkbox State
    const descendants = useMemo(() => isFolder ? getAllDescendantIds(node) : [node.id], [node]);

    // Check Status: All, Some, or None
    const selectedCount = descendants.filter(id => selectedIds.has(id)).length;
    const isAllSelected = selectedCount === descendants.length && descendants.length > 0;
    const isIndeterminate = selectedCount > 0 && selectedCount < descendants.length;

    const handleCheck = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newState = !isAllSelected; // Toggle based on current full state
        onToggleSelect(descendants, newState);
    };

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    return (
        <div className="select-none text-titanium-100">
            <div
                className={`
                    flex items-center gap-2 py-1 px-2 rounded-md transition-colors
                    hover:bg-titanium-700/50 cursor-pointer
                    ${isAllSelected ? 'bg-cyan-900/10' : ''}
                `}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={isFolder ? handleExpand : handleCheck}
            >
                {/* EXPANDER */}
                <div className="w-4 h-4 flex items-center justify-center shrink-0 text-titanium-500 hover:text-cyan-400">
                    {isFolder && (
                        isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                </div>

                {/* CHECKBOX */}
                <div
                    className={`
                        w-4 h-4 flex items-center justify-center shrink-0 rounded border cursor-pointer transition-all
                        ${isAllSelected || isIndeterminate
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'border-titanium-600 hover:border-cyan-500'
                        }
                    `}
                    onClick={handleCheck}
                >
                    {isAllSelected && <CheckSquare size={12} />}
                    {isIndeterminate && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                </div>

                {/* ICON & NAME */}
                <div className="flex items-center gap-2 truncate opacity-90">
                    {isFolder ? (
                        <Folder size={14} className="text-amber-500/80" />
                    ) : (
                        <FileText size={14} className="text-cyan-500/80" />
                    )}
                    <span className="text-sm truncate">{node.name}</span>
                </div>
            </div>

            {/* CHILDREN */}
            {isFolder && isOpen && node.children && (
                <div className="border-l border-titanium-800 ml-[15px]">
                    {node.children.map(child => (
                        <CheckableTreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            selectedIds={selectedIds}
                            onToggleSelect={onToggleSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- MAIN PANEL ---
const ExportPanel: React.FC<ExportPanelProps> = ({ onClose, folderId, accessToken }) => {
    const { config, fileTree, isFileTreeLoading, user } = useProjectConfig();

    // UI STATE
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [author, setAuthor] = useState('');
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
    const [isCompiling, setIsCompiling] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [isExportingAudit, setIsExportingAudit] = useState(false);
    const [auditFormat, setAuditFormat] = useState<'txt' | 'md' | 'pdf'>('txt');
    const [certificateLink, setCertificateLink] = useState<string | null>(null);
    const [isGeneratingCert, setIsGeneratingCert] = useState(false);

    // OPTIONS STATE
    const [options, setOptions] = useState<ExportOptions>({
        includeCover: true,
        includeToc: true,
        pageBreakPerFile: true,
        smartBreaks: false
    });

    // AUTO-FILL METADATA
    useEffect(() => {
        if (config?.projectName) setTitle(config.projectName);
        // Try to guess author from user profile or config if available, else leave blank
    }, [config]);

    // HANDLER: SELECT FILES
    const handleToggleSelect = (ids: string[], selected: boolean) => {
        const newSet = new Set(selectedFileIds);
        ids.forEach(id => {
            if (selected) newSet.add(id);
            else newSet.delete(id);
        });
        setSelectedFileIds(newSet);
    };

    // HANDLER: COMPILE
    const handleCompile = async () => {
        if (selectedFileIds.size === 0) {
            toast.error("Selecciona al menos un archivo para imprimir.");
            return;
        }
        if (!title || !author) {
            toast.error("El Título y el Autor son obligatorios.");
            return;
        }

        setIsCompiling(true);
        setDownloadUrl(null);
        toast.info("Iniciando prensas de impresión...");

        try {
            // CONSTRUCT ORDERED LIST
            // We must traverse the tree to maintain structure order,
            // picking only selected files.
            const getOrderedSelection = (nodes: FileNode[]): string[] => {
                let orderedIds: string[] = [];
                for (const node of nodes) {
                    if (node.mimeType !== 'application/vnd.google-apps.folder' && selectedFileIds.has(node.id)) {
                        orderedIds.push(node.id);
                    }
                    if (node.children) {
                        orderedIds = [...orderedIds, ...getOrderedSelection(node.children)];
                    }
                }
                return orderedIds;
            };

            const orderedFiles = fileTree ? getOrderedSelection(fileTree) : [];

            const data = await callFunction<any>('compileManuscript', {
                fileIds: orderedFiles,
                title,
                subtitle,
                author,
                options,
                accessToken
            });

            if (data.success && data.pdf) {
                // Convert Base64 to Blob URL
                const byteCharacters = atob(data.pdf);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);

                setDownloadUrl(url);
                toast.success(`¡Manuscrito compilado! (${data.fileCount} archivos)`);
            }

        } catch (error: any) {
            console.error("Compilation Error:", error);
            toast.error(`Error en la imprenta: ${error.message}`);
        } finally {
            setIsCompiling(false);
        }
    };

    // HANDLER: EXPORT AUDIT LOG
    const handleExportAudit = async () => {
        if (!folderId) return;
        if (!user || !user.uid) {
            toast.error("Error de identidad: No se puede firmar el certificado.");
            return;
        }

        setIsExportingAudit(true);
        const toastId = toast.loading("Generando Certificado Legal...");

        try {
            if (auditFormat === 'pdf') {
                toast.loading("Compilando PDF oficial...", { id: toastId });
                const pdfBase64 = await CreativeAuditService.fetchAuditPDF(folderId);

                if (!pdfBase64) throw new Error("PDF generation failed.");

                // Convert Base64 to Blob
                const byteCharacters = atob(pdfBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: "application/pdf" });

                // Download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(title || 'Project').replace(/ /g, '_')}_Legal_Audit.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const reportText = await CreativeAuditService.generateAuditReport(folderId, user.uid, auditFormat);

                const mime = auditFormat === 'md' ? 'text/markdown' : 'text/plain';
                const ext = auditFormat;

                const blob = new Blob([reportText], { type: mime });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(title || 'Project').replace(/ /g, '_')}_Legal_Audit.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            toast.success(`Certificado de Autoría (${auditFormat.toUpperCase()}) descargado.`, { id: toastId });
        } catch (error) {
            console.error("Audit Export Error:", error);
            toast.error("Error al generar certificado.", { id: toastId });
        } finally {
            setIsExportingAudit(false);
        }
    };

    // HANDLER: GENERATE PUBLIC CERTIFICATE
    const handleGenerateCertificate = async () => {
        if (!folderId || !user) return;

        setIsGeneratingCert(true);
        const toastId = toast.loading("Notariando Certificado en la Blockchain (Simulada)...");

        try {
            const result = await callFunction<any>('generateCertificate', {
                projectId: folderId,
                projectTitle: title || 'Proyecto Sin Título'
            });

            if (result.success && result.certificateId) {
                const link = `${window.location.origin}/verify/${result.certificateId}`;
                setCertificateLink(link);
                toast.success("¡Certificado Acuñado!", { id: toastId });
            }
        } catch (error) {
            console.error("Certificate Error:", error);
            toast.error("Error al generar certificado.", { id: toastId });
        } finally {
            setIsGeneratingCert(false);
        }
    };

    return (
        <div className="w-full h-full bg-titanium-950 flex flex-col animate-fade-in overflow-hidden">
            {/* HEADER */}
            <div className="h-14 border-b border-titanium-800 flex items-center justify-between px-6 bg-titanium-900/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/10 rounded-lg">
                        <Printer className="text-cyan-400" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-wide">LA IMPRENTA <span className="text-xs text-titanium-500 font-normal ml-2">v3.3 TITAN</span></h2>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* ZONE A: COMPOSITION (LEFT 60%) */}
                <div className="w-[60%] border-r border-titanium-800 flex flex-col bg-titanium-900/20">
                    <div className="p-4 border-b border-titanium-800 bg-titanium-900/30 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-titanium-400 uppercase tracking-wider">Composición del Manuscrito</h3>
                        <span className="text-xs text-cyan-500 font-mono">{selectedFileIds.size} archivos</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-titanium-700">
                        {isFileTreeLoading ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-3 text-titanium-500">
                                <Loader2 className="animate-spin text-cyan-500" size={24} />
                                <span className="text-sm">Escaneando estructura del proyecto...</span>
                            </div>
                        ) : fileTree && fileTree.length > 0 ? (
                            <div className="flex flex-col gap-1">
                                {fileTree.map(node => (
                                    <CheckableTreeNode
                                        key={node.id}
                                        node={node}
                                        depth={0}
                                        selectedIds={selectedFileIds}
                                        onToggleSelect={handleToggleSelect}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-titanium-600">
                                <Folder size={32} className="mb-2 opacity-20" />
                                <p>No se encontraron archivos.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ZONE B: SETTINGS (RIGHT 40%) */}
                <div className="w-[40%] flex flex-col bg-titanium-800/10">
                    <div className="p-4 border-b border-titanium-800 bg-titanium-900/30">
                        <h3 className="text-xs font-bold text-titanium-400 uppercase tracking-wider">Prensa y Ajustes</h3>
                    </div>

                    <div className="p-6 flex flex-col gap-6 overflow-y-auto">
                        {/* METADATA */}
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs text-titanium-400 font-bold uppercase">Título del Libro</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Ej. Crónicas de Titán"
                                    className="w-full bg-titanium-950 border border-titanium-700 rounded-lg p-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all placeholder:text-titanium-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-titanium-400 font-bold uppercase">Subtítulo (Opcional)</label>
                                <input
                                    type="text"
                                    value={subtitle}
                                    onChange={(e) => setSubtitle(e.target.value)}
                                    placeholder="Ej. Libro I: El Despertar"
                                    className="w-full bg-titanium-950 border border-titanium-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none transition-all placeholder:text-titanium-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-titanium-400 font-bold uppercase">Autor</label>
                                <input
                                    type="text"
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    placeholder="Nombre del Autor"
                                    className="w-full bg-titanium-950 border border-titanium-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none transition-all placeholder:text-titanium-700"
                                />
                            </div>
                        </div>

                        <div className="w-full h-px bg-titanium-800" />

                        {/* FORMAT OPTIONS */}
                        <div className="space-y-3">
                            <h4 className="text-xs text-titanium-500 font-bold uppercase mb-2">Formato de Salida</h4>

                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div
                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${options.includeCover ? 'bg-cyan-600 border-cyan-500' : 'border-titanium-600 group-hover:border-titanium-400'}`}
                                    onClick={() => setOptions({ ...options, includeCover: !options.includeCover })}
                                >
                                    {options.includeCover && <CheckSquare size={14} className="text-white" />}
                                </div>
                                <span className="text-sm text-titanium-200">Incluir Portada</span>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div
                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${options.includeToc ? 'bg-cyan-600 border-cyan-500' : 'border-titanium-600 group-hover:border-titanium-400'}`}
                                    onClick={() => setOptions({ ...options, includeToc: !options.includeToc })}
                                >
                                    {options.includeToc && <CheckSquare size={14} className="text-white" />}
                                </div>
                                <span className="text-sm text-titanium-200">Incluir Índice (TOC)</span>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div
                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${options.pageBreakPerFile ? 'bg-cyan-600 border-cyan-500' : 'border-titanium-600 group-hover:border-titanium-400'}`}
                                    onClick={() => setOptions({ ...options, pageBreakPerFile: !options.pageBreakPerFile })}
                                >
                                    {options.pageBreakPerFile && <CheckSquare size={14} className="text-white" />}
                                </div>
                                <span className="text-sm text-titanium-200">Salto de página por archivo</span>
                            </label>

                            {/* SMART BREAKS */}
                            <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-all">
                                <div
                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${options.smartBreaks ? 'bg-amber-600 border-amber-500' : 'border-amber-700 group-hover:border-amber-500'}`}
                                    onClick={() => setOptions({ ...options, smartBreaks: !options.smartBreaks })}
                                >
                                    {options.smartBreaks && <CheckSquare size={14} className="text-white" />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm text-amber-100 font-medium">Auto-Detectar Capítulos</span>
                                    <span className="text-[10px] text-amber-500/80">Usa headers (#) como saltos de página</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* ACTION FOOTER */}
                    <div className="mt-auto p-6 border-t border-titanium-800 bg-titanium-900/50">
                        {!downloadUrl ? (
                            <button
                                onClick={handleCompile}
                                disabled={isCompiling}
                                className={`
                                    w-full py-4 rounded-xl font-bold text-white tracking-widest uppercase transition-all shadow-lg
                                    flex items-center justify-center gap-3
                                    ${isCompiling
                                        ? 'bg-titanium-700 cursor-not-allowed opacity-70'
                                        : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-red-900/20 hover:shadow-red-900/40 hover:scale-[1.02]'
                                    }
                                `}
                            >
                                {isCompiling ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        <span>Prensando...</span>
                                    </>
                                ) : (
                                    <>
                                        <BookOpen size={20} />
                                        <span>Compilar Manuscrito</span>
                                    </>
                                )}
                            </button>
                        ) : (
                            <a
                                href={downloadUrl}
                                download={`${title.replace(/ /g, '_')}.pdf`}
                                className="
                                    w-full py-4 rounded-xl font-bold text-white tracking-widest uppercase transition-all shadow-lg
                                    flex items-center justify-center gap-3
                                    bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600
                                    shadow-emerald-900/20 hover:shadow-emerald-900/40 hover:scale-[1.02]
                                "
                            >
                                <Download size={20} />
                                <span>Descargar PDF</span>
                            </a>
                        )}

                        {/* LEGAL AUDIT & PUBLIC CERTIFICATE */}
                        <div className="mt-4 p-3 bg-titanium-900/40 rounded-lg border border-titanium-800 space-y-3">
                            <div>
                                <label className="text-[10px] text-titanium-500 font-bold uppercase mb-2 block">Formato del Reporte (Privado)</label>
                                <div className="flex gap-2">
                                    {['txt', 'md', 'pdf'].map(fmt => (
                                        <button
                                            key={fmt}
                                            onClick={() => setAuditFormat(fmt as any)}
                                            aria-pressed={auditFormat === fmt}
                                            className={`
                                                px-3 py-1 rounded text-xs font-bold uppercase transition-all
                                                ${auditFormat === fmt
                                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                                                    : 'bg-titanium-800 text-titanium-400 hover:text-white hover:bg-titanium-700'}
                                            `}
                                        >
                                            {fmt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={handleExportAudit}
                                    disabled={isExportingAudit}
                                    className="w-full mt-2 py-2 rounded border border-titanium-700 hover:border-titanium-500 text-titanium-400 hover:text-white transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider group"
                                >
                                    {isExportingAudit ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} className="group-hover:text-emerald-400 transition-colors" />}
                                    <span>Descargar Reporte</span>
                                </button>
                            </div>

                            <div className="pt-3 border-t border-titanium-800">
                                <label className="text-[10px] text-titanium-500 font-bold uppercase mb-2 block flex items-center gap-2">
                                    <Shield size={10} className="text-cyan-400" />
                                    Certificado Público
                                </label>

                                {certificateLink ? (
                                    <div className="p-2 bg-emerald-900/20 border border-emerald-500/30 rounded flex flex-col gap-2">
                                        <div className="text-[10px] text-emerald-300 font-mono break-all bg-black/20 p-1 rounded">
                                            {certificateLink}
                                        </div>
                                        <a
                                            href={certificateLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-center py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase rounded transition-colors"
                                        >
                                            Ver Certificado
                                        </a>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(certificateLink);
                                                toast.success("Enlace copiado");
                                            }}
                                            className="text-center py-1.5 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 text-[10px] font-bold uppercase rounded transition-colors"
                                        >
                                            Copiar Enlace
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleGenerateCertificate}
                                        disabled={isGeneratingCert}
                                        className="w-full py-2 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-800 hover:border-cyan-500 text-cyan-300 rounded transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider group"
                                    >
                                        {isGeneratingCert ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                                        <span>Generar Certificado Público</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 text-center">
                            <span className="text-[10px] text-titanium-600">
                                {isCompiling ? 'Esto puede tardar unos segundos. No cierres la ventana.' : 'Formato PDF v1.4 (Titanium Engine)'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportPanel;
