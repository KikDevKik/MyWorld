import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { User, Brain, Sparkles, HardDrive, FileSearch, Trash2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useProjectConfig } from '../ProjectConfigContext';

interface SettingsModalProps {
    onClose: () => void;
    onSave: (url: string) => void;
    accessToken?: string | null;
    onGetFreshToken?: () => Promise<string | null>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave, accessToken, onGetFreshToken }) => {
    const { config, updateConfig } = useProjectConfig(); // 🟢 Use Context
    const [activeTab, setActiveTab] = useState<'general' | 'profile' | 'memory'>('general');
    const [profile, setProfile] = useState({
        style: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isReindexing, setIsReindexing] = useState(false);
    const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);

    // Load data on mount
    useEffect(() => {
        const loadData = async () => {
            const functions = getFunctions();

            // 1. Load Writer Profile
            try {
                const getUserProfile = httpsCallable(functions, 'getUserProfile');
                const result = await getUserProfile();
                if (result.data) {
                    setProfile(result.data as any);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
            }
        };
        loadData();
    }, [config]); // 🟢 Re-run when config changes


    // 🟢 NEW: Project Name Local State (for input binding)
    const [localProjectName, setLocalProjectName] = useState('');

    useEffect(() => {
        if (config?.projectName) {
            setLocalProjectName(config.projectName);
        } else if (config?.activeBookContext && config.activeBookContext !== "Just Megu") {
             // Fallback initialization if projectName is empty but we have a context
            setLocalProjectName(config.activeBookContext);
        }
    }, [config]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            // Save Drive URL (existing functionality) - Allow clearing it
            onSave('');

            // 🟢 NEW: Save Project Config (Project Name)
            if (config) {
                 await updateConfig({
                     ...config,
                     projectName: localProjectName
                 });
            }

            // Save writer profile
            const functions = getFunctions();
            const saveUserProfile = httpsCallable(functions, 'saveUserProfile');

            // 🟢 ZERO WASTE: Only send what we manage.
            // The backend handles missing fields by defaulting to empty strings, effectively clearing them.
            await saveUserProfile({
                style: profile.style
            });

            toast.success('Configuración guardada correctamente');
            onClose();
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('Error al guardar la configuración');
        } finally {
            setIsLoading(false);
        }
    };

    // --- AUDIT LOGIC ---
    // Note: getFolderIdFromUrl is deprecated for these actions but kept for fallback or legacy input
    const getFolderIdFromUrl = (inputUrl: string) => {
        if (!inputUrl) return null;
        if (inputUrl.includes("drive.google.com")) {
            const match = inputUrl.match(/folders\/([a-zA-Z0-9-_]+)/);
            if (match && match[1]) return match[1];
        }
        return inputUrl.length > 20 ? inputUrl : null;
    };

    const traverseAndLog = (nodes: any[], path: string = '') => {
        let count = 0;
        nodes.forEach(node => {
            const fullPath = `${path}/${node.name}`;
            console.log(`%c[AUDIT] Found: ${fullPath} (${node.id}) [${node.mimeType}]`, 'color: #00ff99');
            count++;
            if (node.children) {
                count += traverseAndLog(node.children, fullPath);
            }
        });
        return count;
    };

    const handleAudit = async () => {
        // 🟢 NEW LOGIC: Use Project Config Source of Truth
        if (!config) {
            toast.error("Cargando configuración... intenta de nuevo en unos segundos.");
            return;
        }

        const allPaths = [...config.canonPaths, ...config.resourcePaths];
        if (allPaths.length === 0) {
             toast.error("No hay carpetas configuradas. Ve a la pestaña Proyecto y añade carpetas.");
             return;
        }

        // Construct IDs from config
        const folderIds = allPaths.map(p => p.id);

        setIsAuditing(true);
        console.clear();
        console.log(`%c🚀 INICIANDO AUDITORÍA DE RUTAS (DRY RUN) [MULTI-ROOT]...`, 'color: yellow; font-size: 14px; font-weight: bold;');
        console.log("Targets:", folderIds);

        try {
            let token = accessToken;

            // 🟢 RE-AUTH LOGIC
            if (onGetFreshToken) {
                try {
                    console.log("🔄 Renovando credenciales de Drive...");
                    const freshToken = await onGetFreshToken();
                    if (freshToken) token = freshToken;
                    else throw new Error("No se pudo renovar el acceso a Drive.");
                } catch (authErr) {
                    console.error("Auth Refresh Failed:", authErr);
                    toast.error("No se pudo renovar el acceso. Por favor re-autentica.");
                    setIsAuditing(false);
                    return;
                }
            }

            if (!token) {
                 toast.error("Error de autenticación: No hay token disponible.");
                 setIsAuditing(false);
                 return;
            }

            const functions = getFunctions();
            const getDriveFiles = httpsCallable(functions, 'getDriveFiles');

            toast.info('Escaneando estructura de carpetas (puede tardar)...');

            const result = await getDriveFiles({
                folderIds: folderIds, // 👈 New: Pass array of IDs
                recursive: true,
                accessToken: token
            });

            const fileTree = result.data as any[];
            console.log('📦 Raw File Tree:', fileTree);

            const totalFiles = traverseAndLog(fileTree);

            console.log(`%c✅ AUDITORÍA COMPLETADA. Archivos encontrados: ${totalFiles}`, 'color: yellow; font-weight: bold;');
            toast.success(`Auditoría finalizada. ${totalFiles} archivos detectados. Revisa la consola (F12).`);

        } catch (error: any) {
            console.error('Audit failed:', error);
            toast.error(`Falló la auditoría: ${error.message}`);
        } finally {
            setIsAuditing(false);
        }
    };

    // --- FORCE REINDEX LOGIC ---
    const handleForceReindex = async () => {
        // 🟢 NEW LOGIC: Use Project Config Source of Truth
        if (!config) {
            toast.error("Cargando configuración...");
            return;
        }

        const allPaths = [...config.canonPaths, ...config.resourcePaths];
        if (allPaths.length === 0) {
             toast.error("No hay carpetas configuradas para indexar.");
             return;
        }

        const folderIds = allPaths.map(p => p.id);

        const confirm = window.confirm(
            "⚠️ ¡PELIGRO NUCLEAR! ⚠️\n\n" +
            "Esto borrará TODOS los recuerdos (vectores) existentes de tu proyecto y empezará de cero.\n" +
            "Es útil para eliminar 'fantasmas', pero tomará tiempo.\n\n" +
            "¿Estás seguro de que quieres proceder?"
        );

        if (!confirm) return;

        setIsReindexing(true);
        try {
            let token = accessToken;

            // 🟢 RE-AUTH LOGIC
            if (onGetFreshToken) {
                try {
                    console.log("🔄 Renovando credenciales de Drive (Nuclear)...");
                    const freshToken = await onGetFreshToken();
                    if (freshToken) token = freshToken;
                    else throw new Error("No se pudo renovar el acceso a Drive.");
                } catch (authErr) {
                    console.error("Auth Refresh Failed:", authErr);
                    toast.error("No se pudo renovar el acceso. Operación cancelada.");
                    setIsReindexing(false);
                    return;
                }
            }

            if (!token) {
                 toast.error("Error de autenticación: No hay token disponible.");
                 setIsReindexing(false);
                 return;
            }

            const functions = getFunctions();
            const indexTDB = httpsCallable(functions, 'indexTDB');

            toast.info('Iniciando Purga y Re-indexación Nuclear...');

            const result = await indexTDB({
                folderIds: folderIds, // 👈 New: Pass array of IDs
                projectId: config.folderId, // 👈 Important: Pass legacy ID as Project Context
                forceFullReindex: true,
                accessToken: token
            });

            console.log("☢️ Nuclear Re-index Result:", result.data);

            const stats = result.data as any;
            toast.success(`¡Memoria reconstruida! Archivos: ${stats.filesIndexed || 0}, Chunks: ${stats.chunksCreated || 0}, Fantasmas eliminados: ${stats.ghostFilesPruned || 0}`);
        } catch (error: any) {
            console.error('Nuclear reindex failed:', error);
            toast.error(`Error crítico: ${error.message}`);
        } finally {
            setIsReindexing(false);
        }
    };

    // --- MANUAL RE-AUTH LOGIC ---
    const handleReAuth = async () => {
        if (!onGetFreshToken) {
            toast.error("Función de re-autenticación no disponible.");
            return;
        }

        setIsRefreshingAuth(true);
        try {
            console.log("🔄 Iniciando Re-Auth manual...");
            const token = await onGetFreshToken();

            if (token) {
                toast.success("¡Permisos renovados correctamente! Ahora puedes auditar e indexar.", {
                    description: "El sistema ahora tiene acceso de lectura a tus bóvedas externas."
                });
            } else {
                toast.error("El usuario canceló o falló la autenticación.");
            }
        } catch (error) {
            console.error("Manual Re-Auth Error:", error);
            toast.error("Error al renovar permisos.");
        } finally {
            setIsRefreshingAuth(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-titanium-950 rounded-xl border border-titanium-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">

                {/* HEADER */}
                <div className="flex items-center gap-3 border-b border-titanium-800 p-6 pb-4 bg-titanium-900/50">
                    <div className="p-2 bg-accent-DEFAULT/10 rounded-lg">
                        <User size={24} className="text-accent-DEFAULT" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-titanium-100">Configuración</h3>
                        <p className="text-xs text-titanium-400">Personaliza tu experiencia de escritura</p>
                    </div>
                </div>

                {/* TABS */}
                <div className="flex border-b border-titanium-800 bg-titanium-900/30 px-6">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'general'
                            ? 'border-accent-DEFAULT text-accent-DEFAULT'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                        }`}
                    >
                        <Brain size={16} />
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'profile'
                            ? 'border-accent-DEFAULT text-accent-DEFAULT'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                        }`}
                    >
                        <Sparkles size={16} />
                        Perfil
                    </button>
                    <button
                        onClick={() => setActiveTab('memory')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'memory'
                            ? 'border-red-400 text-red-400'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                        }`}
                    >
                        <HardDrive size={16} />
                        Memoria (Debug)
                    </button>
                </div>

                {/* CONTENT AREA */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">

                    {/* TAB: GENERAL */}
                    {activeTab === 'general' && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Brain size={18} className="text-accent-DEFAULT" />
                                <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">Configuración General</h4>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-titanium-100">Nombre del Proyecto (Universo)</label>
                                <input
                                    type="text"
                                    value={localProjectName}
                                    onChange={(e) => setLocalProjectName(e.target.value)}
                                    className="w-full bg-slate-800 text-white placeholder-gray-500 border border-slate-700 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none"
                                    placeholder="Ej: Crónicas de la Eternidad"
                                />
                                <p className="text-xs text-titanium-400">
                                    Este nombre aparecerá en la interfaz y definirá la identidad global del universo.
                                </p>
                            </div>

                            <div className="h-px bg-titanium-800 my-2" />

                            <p className="text-sm text-titanium-400 italic">
                                La configuración de carpetas se ha movido a la sección "Proyecto".
                            </p>
                        </div>
                    )}

                    {/* TAB: PROFILE */}
                    {activeTab === 'profile' && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={18} className="text-accent-DEFAULT" />
                                <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">Perfil de Escritor</h4>
                            </div>
                            <p className="text-xs text-titanium-400 -mt-2 mb-2">
                                Define tu identidad narrativa. La IA usará esto para personalizar todas sus respuestas.
                            </p>

                            <div className="flex flex-col gap-2 h-full">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-titanium-100">Estilo y Tono</label>
                                    <button
                                        onClick={() => toast.info("🛠️ Módulo en construcción: El Inspector estará disponible en la próxima actualización.")}
                                        className="text-xs flex items-center gap-1.5 px-2 py-1 border border-accent-DEFAULT/30 rounded text-accent-DEFAULT hover:bg-accent-DEFAULT/10 transition-colors"
                                    >
                                        <Sparkles size={12} />
                                        Detectar Automáticamente
                                    </button>
                                </div>
                                <textarea
                                    value={profile.style}
                                    onChange={(e) => setProfile({ ...profile, style: e.target.value })}
                                    className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none resize-none"
                                    placeholder="Describe tu voz narrativa. ¿Eres cínico? ¿Poético? ¿Usas arcaísmos? Escribe aquí tus 'Reglas de Oro' para que la IA las siga."
                                    rows={12}
                                />
                            </div>

                            {/* 📂 READ ONLY NOTE */}
                            <div className="mt-2 p-3 bg-titanium-900/50 border border-titanium-800 rounded-lg flex items-start gap-3">
                                <HardDrive size={16} className="text-titanium-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-titanium-400">
                                    <strong className="text-titanium-200">Gestión de Inspiraciones:</strong> La IA se inspira leyendo directamente tus archivos.
                                    Gestiona tu carpeta de <strong>Recursos</strong> en la pestaña <span className="text-accent-DEFAULT font-medium">Proyecto</span>.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* TAB: MEMORY (DEBUG) */}
                    {activeTab === 'memory' && (
                        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle size={18} className="text-red-400" />
                                <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Zona de Peligro & Debug</h4>
                            </div>

                            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="text-white font-bold flex items-center gap-2">
                                            <FileSearch size={16} className="text-blue-400"/>
                                            Auditoría de Rutas (Dry Run)
                                        </h5>
                                        <p className="text-xs text-titanium-400 mt-1">
                                            Escanea recursivamente TODAS las carpetas sin modificar nada.
                                            Usa esto para verificar si la IA puede "ver" archivos profundos (Ficha Megu.md).
                                            <br/><strong className="text-blue-400">Revisa la consola del navegador (F12) para ver los logs.</strong>
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleAudit}
                                        disabled={isAuditing || isReindexing}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {isAuditing ? <RefreshCw className="animate-spin" size={16}/> : <FileSearch size={16}/>}
                                        {isAuditing ? 'Auditando...' : 'Auditar'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-xl space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="text-red-400 font-bold flex items-center gap-2">
                                            <Trash2 size={16} />
                                            Forzar Re-indexación Total
                                        </h5>
                                        <p className="text-xs text-titanium-400 mt-1">
                                            <span className="text-red-400 font-bold">OPCIÓN NUCLEAR.</span> Borra TODOS los vectores existentes y re-escanea todo desde cero.
                                            Útil si sospechas que hay datos corruptos o archivos fantasma.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleForceReindex}
                                        disabled={isAuditing || isReindexing || isRefreshingAuth}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/30 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {isReindexing ? <RefreshCw className="animate-spin" size={16}/> : <AlertTriangle size={16}/>}
                                        {isReindexing ? 'Purgando...' : 'Nuclear'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-yellow-900/10 border border-yellow-900/30 p-4 rounded-xl space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="text-yellow-400 font-bold flex items-center gap-2">
                                            <ShieldCheck size={16} />
                                            Renovar Permisos (Re-Auth)
                                        </h5>
                                        <p className="text-xs text-titanium-400 mt-1">
                                            Si la auditoría devuelve 0 archivos, usa esto.
                                            Forzará una nueva autenticación para garantizar que la IA tenga permiso de lectura (ReadOnly) sobre tus bóvedas externas.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleReAuth}
                                        disabled={isAuditing || isReindexing || isRefreshingAuth}
                                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600/10 text-yellow-500 hover:bg-yellow-600/20 border border-yellow-600/30 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {isRefreshingAuth ? <RefreshCw className="animate-spin" size={16}/> : <ShieldCheck size={16}/>}
                                        {isRefreshingAuth ? 'Renovando...' : 'Renovar Permisos'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* FOOTER ACTIONS */}
                <div className="flex justify-end gap-3 p-6 border-t border-titanium-800 bg-titanium-900/50 mt-auto">
                    <button
                        onClick={onClose}
                        disabled={isLoading || isAuditing || isReindexing}
                        className="px-5 py-2 text-titanium-400 text-sm font-bold hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading || isAuditing || isReindexing}
                        className="px-5 py-2 bg-accent-DEFAULT text-titanium-950 text-sm font-bold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
