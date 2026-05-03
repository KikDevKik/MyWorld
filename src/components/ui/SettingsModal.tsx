/*
 * Este software y su código fuente son propiedad intelectual de Deiner David Trelles Renteria.
 * Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
 */
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Brain, Sparkles, HardDrive, FileSearch, Trash2, AlertTriangle, RefreshCw, ShieldCheck, Dna, Key, Eye, EyeOff, Info, Globe2, Zap, Leaf } from 'lucide-react';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import InternalFileSelector from '../InternalFileSelector';
import { callFunction } from '../../services/api';
import { useLanguageStore, Language } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import { useTier, TierMode } from '../../hooks/useTier';
import { getAuth } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface SettingsModalProps {
    onClose: () => void;
    onSave: (url: string) => void;
    accessToken?: string | null;
    onGetFreshToken?: () => Promise<string | null>;
    initialTab?: 'general' | 'profile' | 'memory' | 'ai_config' | 'info';
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave, accessToken, onGetFreshToken, initialTab }) => {
    const { config, updateConfig, customGeminiKey, setCustomGeminiKey, fileTree } = useProjectConfig(); // 🟢 Use Context
    const { currentLanguage, setLanguage } = useLanguageStore(); // 🟢 LANGUAGE STORE
    const t = TRANSLATIONS[currentLanguage].settings; // 🟢 LOCALIZED TEXTS
    const { tier, tierMode, setTierMode } = useTier();

    const [activeTab, setActiveTab] = useState<'general' | 'profile' | 'memory' | 'ai_config' | 'info'>(initialTab || 'general');
    const modalRef = React.useRef<HTMLDivElement>(null);

    // 🎨 PALETTE: Focus Trap & Escape Key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);

        // Focus modal on open
        if (modalRef.current) {
            modalRef.current.focus();
        }

        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // 🟢 STYLE IDENTITY STATE
    const [styleIdentity, setStyleIdentity] = useState('');

    // 🟢 ANALYZER STATE
    const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isReindexing, setIsReindexing] = useState(false);
    const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);

    // 🟢 NUKE STEP: 0=normal, 1=primera confirmacion, 2=segunda confirmacion final
    const [nukeStep, setNukeStep] = useState<0 | 1 | 2>(0);

    // 🟢 NEW: Project Name Local State (for input binding)
    const [localProjectName, setLocalProjectName] = useState('');

    // 🟢 BYOK: Local State
    const [localGeminiKey, setLocalGeminiKey] = useState('');
    const [showKey, setShowKey] = useState(false);

    const { isUltra } = useTier();

    // 🟢 GUARDIAN MODE
    const guardianModeKey = `guardian_mode_${config?.folderId || 'global'}`;
    const [guardianMode, setGuardianModeState] = useState<'auto' | 'manual'>(() => {
        const saved = localStorage.getItem(guardianModeKey);
        return (saved as 'auto' | 'manual') || (isUltra ? 'auto' : 'manual');
    });

    const setGuardianMode = (val: 'auto' | 'manual') => {
        localStorage.setItem(guardianModeKey, val);
        setGuardianModeState(val);
    };

    // 🟢 AUTO DISTILL
    const [autoDistill, setAutoDistill] = useState(() => {
        const saved = localStorage.getItem('autoDistillResources');
        return saved === null ? true : saved === 'true';
    });

    const savePreference = async (key: string, value: any) => {
        localStorage.setItem(key, value.toString());
        const userId = getAuth().currentUser?.uid;
        if (!userId) return;
        try {
            await setDoc(doc(db, 'users', userId, 'profile', 'preferences'), { [key]: value }, { merge: true });
        } catch (e) {
            console.error("Error saving preference", e);
        }
    };

    // 🟢 WELCOME CARDS TOGGLE
    const [welcomeCardsDisabled, setWelcomeCardsDisabled] = useState(
        () => localStorage.getItem('welcome_cards_disabled') === 'true'
    );

    // FIX #6/#7/#8 — Architect awareness toggles
    const [breakRemindersDisabled, setBreakRemindersDisabled] = useState(
        () => localStorage.getItem('break_reminders_disabled') === 'true'
    );
    const [roadmapRemindersDisabled, setRoadmapRemindersDisabled] = useState(
        () => localStorage.getItem('roadmap_reminders_disabled') === 'true'
    );

    useEffect(() => {
        if (config) {
            setLocalProjectName(config.projectName || config.activeBookContext || '');
            // Load Style from Config
            if (config.styleIdentity) {
                setStyleIdentity(config.styleIdentity);
            }
        }
        // Load Key from Context (LocalStorage)
        if (customGeminiKey) {
            setLocalGeminiKey(customGeminiKey);
        }
    }, [config, customGeminiKey]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            // Save Drive URL (existing functionality) - Allow clearing it
            onSave('');

            // 🟢 NEW: Save Project Config (Project Name + Style Identity)
            if (config) {
                await updateConfig({
                    ...config,
                    projectName: localProjectName,
                    styleIdentity: styleIdentity // 👈 Persist Style DNA
                });
            }

            // 🟢 BYOK: Save Custom Key to LocalStorage (via Context)
            setCustomGeminiKey(localGeminiKey);

            toast.success(t.savedSuccess);
            onClose();
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('Error al guardar la configuración');
        } finally {
            setIsLoading(false);
        }
    };

    // 🟢 NUKE LOGIC
    const handleNukeProject = async () => {
        if (!fileTree || fileTree.length === 0) {
            toast.error("El proyecto ya está vacío.");
            return;
        }

        // 1. First Confirmation
        if (!window.confirm(t.nukeWarning)) return;

        // 2. Second Confirmation (Typed)
        // Hardcode expected keywords per language to match translation logic if needed,
        // or just accept English/Spanish 'Delete'/'Borrar' universally for safety.
        // For strict localization, we can rely on what the prompt asks.
        const keyword = currentLanguage === 'es' ? 'Borrar' : 'Delete';
        const input = window.prompt(`${t.nukeModalTitle}\n\n${t.nukeConfirmInput}`);

        if (input !== keyword) {
            toast.error("Confirmación incorrecta.");
            return;
        }

        setIsLoading(true);
        try {
            toast.loading("💥 Iniciando destrucción total...", { id: 'nuke-toast' });

            // 🟢 ATOMIC NUKE: Call single cloud function
            await callFunction('nukeProject', {
                accessToken: accessToken,
                rootFolderId: config?.folderId // Pass root ID to trash parent folder
            });

            toast.dismiss('nuke-toast');

            // 🟢 Reset Project Identity (Client Side Mirror)
            if (config) {
                await updateConfig({
                    ...config,
                    projectName: '',
                    styleIdentity: '',
                    canonPaths: [],
                    resourcePaths: [],
                    primaryCanonPathId: null,
                    characterVaultId: null,
                    bestiaryVaultId: null,
                    folderMapping: {},
                    activeBookContext: ''
                });
            }

            toast.success(t.nukeSuccess);

            // 🟢 Force Reload to Reset State
            setTimeout(() => window.location.reload(), 2000);

        } catch (error: any) {
            toast.dismiss('nuke-toast');
            console.error("Nuke Error:", error);
            toast.error("Error al destruir: " + (error.message || "Error desconocido"));
        } finally {
            setIsLoading(false);
        }
    };

    // 🟢 ANALYZE STYLE HANDLER
    const handleAnalyzeStyle = async (selectedFiles: { id: string }[]) => {
        setIsAnalyzerOpen(false); // Close selector
        setIsAnalyzing(true);

        try {
            if (selectedFiles.length === 0) {
                toast.error("Selecciona al menos un archivo.");
                setIsAnalyzing(false);
                return;
            }

            // 🟢 SECURITY PATCH: FORCE FRESH TOKEN
            let safeToken = accessToken;
            if (onGetFreshToken) {
                try {
                    console.log("🔐 Refrescando credenciales para análisis profundo...");
                    const fresh = await onGetFreshToken();
                    if (fresh) safeToken = fresh;
                } catch (e) {
                    console.warn("Could not refresh token, trying with cached one.");
                }
            }

            if (!safeToken) {
                toast.error("Error de credenciales. Por favor recarga la página.");
                setIsAnalyzing(false);
                return;
            }

            const fileIds = selectedFiles.map(f => f.id);

            toast.info("🧬 Extrayendo ADN Narrativo... (Esto puede tardar unos segundos)");

            const data = await callFunction<any>('analyzeStyleDNA', {
                fileIds,
                accessToken: safeToken // 👈 USE FRESH TOKEN
            });

            if (data.styleIdentity) {
                setStyleIdentity(data.styleIdentity);
                toast.success("¡ADN Narrativo extraído con éxito!");
            }

        } catch (error: any) {
            console.error("Style Analysis Error:", error);
            toast.error(`Error en análisis: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
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
        if (!Array.isArray(nodes)) return 0; // 🟢 SECURITY GUARD: Prevent forEach crash on invalid payload
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

            toast.info('Escaneando estructura de carpetas (puede tardar)...');

            const fileTree = await callFunction<any[]>('getDriveFiles', {
                folderIds: folderIds, // 👈 New: Pass array of IDs
                recursive: true,
                accessToken: token
            });

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

            toast.info('Iniciando Purga y Re-indexación Nuclear...');

            const stats = await callFunction<any>('indexTDB', {
                folderIds: folderIds, // 👈 New: Pass array of IDs
                projectId: config.folderId, // 👈 Important: Pass legacy ID as Project Context
                forceFullReindex: true,
                accessToken: token
            });

            console.log("☢️ Nuclear Re-index Result:", stats);

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
        <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
        >
            {/* 🟢 INCREASED MAX WIDTH: max-w-2xl -> max-w-5xl */}
            <div
                ref={modalRef}
                tabIndex={-1}
                className="bg-titanium-950 rounded-xl border border-titanium-800 shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in outline-none"
            >

                {/* HEADER */}
                <div className="flex items-center gap-3 border-b border-titanium-800 p-6 pb-4 bg-titanium-900/50">
                    <div className="p-2 bg-accent-DEFAULT/10 rounded-lg">
                        <User size={24} className="text-accent-DEFAULT" />
                    </div>
                    <div>
                        <h3 id="settings-title" className="text-lg font-bold text-titanium-100">{t.title}</h3>
                        <p className="text-xs text-titanium-400">{t.subtitle}</p>
                    </div>
                </div>

                {/* TABS */}
                <div role="tablist" aria-label="Settings Tabs" className="flex border-b border-titanium-800 bg-titanium-900/30 px-6">
                    <button
                        role="tab"
                        aria-selected={activeTab === 'general'}
                        aria-controls="panel-general"
                        id="tab-general"
                        onClick={() => setActiveTab('general')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-DEFAULT/50 focus-visible:bg-white/5 ${activeTab === 'general'
                            ? 'border-accent-DEFAULT text-accent-DEFAULT'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <Brain size={16} />
                        {t.tabGeneral}
                    </button>
                    <button
                        role="tab"
                        aria-selected={activeTab === 'profile'}
                        aria-controls="panel-profile"
                        id="tab-profile"
                        onClick={() => setActiveTab('profile')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-DEFAULT/50 focus-visible:bg-white/5 ${activeTab === 'profile'
                            ? 'border-accent-DEFAULT text-accent-DEFAULT'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <Sparkles size={16} />
                        {t.tabProfile}
                    </button>
                    <button
                        role="tab"
                        aria-selected={activeTab === 'ai_config'}
                        aria-controls="panel-ai_config"
                        id="tab-ai_config"
                        onClick={() => setActiveTab('ai_config')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-DEFAULT/50 focus-visible:bg-white/5 ${activeTab === 'ai_config'
                            ? 'border-purple-400 text-purple-400'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <Key size={16} />
                        {t.tabAi}
                    </button>
                    <button
                        role="tab"
                        aria-selected={activeTab === 'memory'}
                        aria-controls="panel-memory"
                        id="tab-memory"
                        onClick={() => setActiveTab('memory')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-DEFAULT/50 focus-visible:bg-white/5 ${activeTab === 'memory'
                            ? 'border-red-400 text-red-400'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <HardDrive size={16} />
                        {t.tabMemory}
                    </button>
                    <button
                        role="tab"
                        aria-selected={activeTab === 'info'}
                        aria-controls="panel-info"
                        id="tab-info"
                        onClick={() => setActiveTab('info')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-DEFAULT/50 focus-visible:bg-white/5 ${activeTab === 'info'
                            ? 'border-cyan-400 text-cyan-400'
                            : 'border-transparent text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <Info size={16} />
                        {t.tabAbout}
                    </button>
                </div>

                {/* CONTENT AREA */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">

                    {/* TAB: GENERAL */}
                    {activeTab === 'general' && (
                        <div role="tabpanel" id="panel-general" aria-labelledby="tab-general" className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Brain size={18} className="text-accent-DEFAULT" />
                                <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">{t.genConfig}</h4>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Project Name */}
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="project-name-input" className="text-sm font-medium text-titanium-100">{t.projectName}</label>
                                    <input
                                        id="project-name-input"
                                        type="text"
                                        value={localProjectName}
                                        onChange={(e) => setLocalProjectName(e.target.value)}
                                        className="w-full bg-slate-800 text-white placeholder-gray-500 border border-slate-700 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none"
                                        placeholder="Ej: Crónicas de la Eternidad"
                                    />
                                    <p className="text-xs text-titanium-400">
                                        {t.projectNameDesc}
                                    </p>
                                </div>

                                {/* 🟢 LANGUAGE SELECTOR */}
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="language-select" className="text-sm font-medium text-titanium-100 flex items-center gap-2">
                                        <Globe2 size={16} />
                                        {t.language}
                                    </label>
                                    <div className="relative">
                                        <select
                                            id="language-select"
                                            value={currentLanguage}
                                            onChange={(e) => setLanguage(e.target.value as Language)}
                                            className="w-full appearance-none bg-slate-800 text-white border border-slate-700 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none cursor-pointer"
                                        >
                                            <option value="es">Español (ES)</option>
                                            <option value="en">English (EN)</option>
                                            <option value="jp">日本語 (JP)</option>
                                            <option value="ko">한국어 (KO)</option>
                                            <option value="zh">中文 (ZH)</option>
                                        </select>
                                    </div>
                                    <p className="text-xs text-titanium-400">
                                        {t.languageDesc}
                                    </p>
                                </div>
                            </div>

                            <div className="h-px bg-titanium-800 my-2" />

                            {/* 🟢 EXPERIENCIA — Welcome cards toggle */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-medium text-titanium-500 uppercase tracking-wider">
                                    Experiencia
                                </h4>

                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <p className="text-sm text-titanium-300">Paneles de bienvenida</p>
                                        <p className="text-xs text-titanium-500 mt-0.5">
                                            Mostrar guías al abrir cada herramienta por primera vez
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const next = !welcomeCardsDisabled;
                                            localStorage.setItem('welcome_cards_disabled', String(next));
                                            setWelcomeCardsDisabled(next);
                                            toast.success(next ? 'Paneles de bienvenida desactivados' : 'Paneles de bienvenida activados');
                                        }}
                                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${!welcomeCardsDisabled ? 'bg-cyan-500' : 'bg-titanium-700'
                                            }`}
                                        aria-label="Toggle paneles de bienvenida"
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${!welcomeCardsDisabled ? 'translate-x-5' : 'translate-x-0.5'
                                            }`} />
                                    </button>
                                </div>

                                {!welcomeCardsDisabled && (
                                    <button
                                        onClick={() => {
                                            Object.keys(localStorage)
                                                .filter(key => key.startsWith('welcome_dismissed_'))
                                                .forEach(key => localStorage.removeItem(key));
                                            toast.success('Guías de bienvenida restablecidas');
                                        }}
                                        className="text-xs text-titanium-500 hover:text-titanium-300 transition-colors underline"
                                    >
                                        Restablecer todas las guías
                                    </button>
                                )}

                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <p className="text-sm text-titanium-300">Recordatorio de pausa (Arquitecto)</p>
                                        <p className="text-xs text-titanium-500 mt-0.5">
                                            Notificar al resolver 5 disonancias seguidas
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const next = !breakRemindersDisabled;
                                            localStorage.setItem('break_reminders_disabled', String(next));
                                            setBreakRemindersDisabled(next);
                                            toast.success(next ? 'Recordatorio de pausa desactivado' : 'Recordatorio de pausa activado');
                                        }}
                                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${!breakRemindersDisabled ? 'bg-cyan-500' : 'bg-titanium-700'
                                            }`}
                                        aria-label="Toggle recordatorio de pausa"
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${!breakRemindersDisabled ? 'translate-x-5' : 'translate-x-0.5'
                                            }`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <p className="text-sm text-titanium-300">Recordatorio de Roadmap (Arquitecto)</p>
                                        <p className="text-xs text-titanium-500 mt-0.5">
                                            Sugerir cristalizar el Roadmap al resolver 7 disonancias
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const next = !roadmapRemindersDisabled;
                                            localStorage.setItem('roadmap_reminders_disabled', String(next));
                                            setRoadmapRemindersDisabled(next);
                                            toast.success(next ? 'Recordatorio de Roadmap desactivado' : 'Recordatorio de Roadmap activado');
                                        }}
                                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${!roadmapRemindersDisabled ? 'bg-cyan-500' : 'bg-titanium-700'
                                            }`}
                                        aria-label="Toggle recordatorio de Roadmap"
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${!roadmapRemindersDisabled ? 'translate-x-5' : 'translate-x-0.5'
                                            }`} />
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-titanium-800 my-2" />

                            <p className="text-sm text-titanium-400 italic">
                                {t.folderConfigMoved}
                            </p>

                            {/* 🟢 NUKE ZONE */}
                            <div className="mt-4 p-4 bg-red-950/20 border border-red-900/30 rounded-xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={18} className="text-red-500" />
                                    <h4 className="text-sm font-bold text-red-500 uppercase tracking-wider">{t.nukeZone}</h4>
                                </div>
                                <p className="text-xs text-titanium-400">
                                    {t.nukeDesc}
                                </p>

                                {/* STEP 0: Botón normal */}
                                {nukeStep === 0 && (
                                    <button
                                        onClick={() => setNukeStep(1)}
                                        className="w-full py-2 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-400 hover:text-red-300 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={16} />
                                        {t.nukeButton}
                                    </button>
                                )}

                                {/* STEP 1: Primera confirmación */}
                                {nukeStep === 1 && (
                                    <div className="flex flex-col gap-3 p-4 border border-red-500/30 rounded-lg bg-red-950/20">
                                        <p className="text-sm text-red-300 font-medium">
                                            ⚠️ Esto borrará Drive, toda la memoria de IA y el historial completo. ¿Continuar?
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setNukeStep(2)}
                                                className="flex-1 py-2 bg-red-500/20 border border-red-500/40 text-red-400 text-sm rounded-lg hover:bg-red-500/30 transition-colors"
                                            >
                                                Sí, entiendo las consecuencias
                                            </button>
                                            <button
                                                onClick={() => setNukeStep(0)}
                                                className="flex-1 py-2 text-titanium-500 border border-titanium-700 text-sm rounded-lg hover:bg-titanium-800/30 transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: Segunda confirmación final */}
                                {nukeStep === 2 && (
                                    <div className="flex flex-col gap-3 p-4 border border-red-500/50 rounded-lg bg-red-950/30">
                                        <p className="text-sm text-red-200 font-medium">
                                            Última oportunidad. Esta acción NO se puede deshacer completamente. Los archivos de Drive van a la papelera (recuperables 30 días), pero la memoria de IA se pierde para siempre.
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setNukeStep(0); handleNukeProject(); }}
                                                className="flex-1 py-2 bg-red-600/30 border border-red-500 text-red-300 text-sm rounded-lg hover:bg-red-600/40 transition-colors font-medium"
                                            >
                                                Confirmar — Borrar Todo
                                            </button>
                                            <button
                                                onClick={() => setNukeStep(0)}
                                                className="flex-1 py-2 text-titanium-500 border border-titanium-700 text-sm rounded-lg hover:bg-titanium-800/30 transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB: PROFILE */}
                    {activeTab === 'profile' && (
                        <div role="tabpanel" id="panel-profile" aria-labelledby="tab-profile" className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={18} className="text-accent-DEFAULT" />
                                <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">{t.narrativeIdentity}</h4>
                            </div>
                            <p className="text-xs text-titanium-400 -mt-2 mb-2">
                                {t.dnaDesc}
                            </p>

                            <div className="flex flex-col gap-2 h-full">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-titanium-100 flex items-center gap-2">
                                        <Dna size={14} className="text-purple-400" />
                                        {t.styleDef}
                                    </label>
                                    <button
                                        onClick={() => setIsAnalyzerOpen(true)}
                                        disabled={isAnalyzing}
                                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 border border-accent-DEFAULT/30 rounded-md text-accent-DEFAULT hover:bg-accent-DEFAULT/10 transition-colors disabled:opacity-50"
                                    >
                                        {isAnalyzing ? (
                                            <RefreshCw className="animate-spin" size={12} />
                                        ) : (
                                            <Sparkles size={12} />
                                        )}
                                        {isAnalyzing ? t.analyzing : t.extractDna}
                                    </button>
                                </div>
                                <textarea
                                    value={styleIdentity}
                                    onChange={(e) => setStyleIdentity(e.target.value)}
                                    className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none resize-none font-mono text-sm leading-relaxed"
                                    placeholder="Ej: Narrativa cínica en primera persona, atmósfera Noir, oraciones cortas y directas. Uso frecuente de metáforas tecnológicas..."
                                    rows={12}
                                />
                            </div>

                            {/* 📂 READ ONLY NOTE */}
                            <div className="mt-2 p-3 bg-titanium-900/50 border border-titanium-800 rounded-lg flex items-start gap-3">
                                <HardDrive size={16} className="text-titanium-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-titanium-400">
                                    <strong className="text-titanium-200">{t.note}</strong> {t.noteDesc}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* TAB: AI CONFIG */}
                    {activeTab === 'ai_config' && (
                        <div role="tabpanel" id="panel-ai_config" aria-labelledby="tab-ai_config" className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <h3 className="text-xs font-medium text-titanium-500 uppercase tracking-wider mb-4">IA &amp; Seguridad</h3>

                            <div className="grid grid-cols-2 gap-6">

                                {/* COLUMNA IZQUIERDA — Nivel de IA */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Nivel de IA</h4>

                                    <div className="space-y-1">
                                        {[
                                            { value: 'auto' as TierMode, label: 'Automático', desc: 'Detecta desde tu API Key' },
                                            { value: 'normal' as TierMode, label: 'Normal (Gratis)', desc: 'Gemini Flash — Free Tier de Google' },
                                            { value: 'ultra' as TierMode, label: 'Ultra (Pro)', desc: 'Gemini 3.x Premium — requiere billing' },
                                        ].map(option => (
                                            <label
                                                key={option.value}
                                                className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-titanium-900 transition-colors"
                                            >
                                                <input
                                                    type="radio"
                                                    name="tierMode"
                                                    value={option.value}
                                                    checked={tierMode === option.value}
                                                    onChange={() => setTierMode(option.value)}
                                                    className="mt-0.5 accent-yellow-400 shrink-0"
                                                />
                                                <div>
                                                    <span className="text-sm text-titanium-100 font-medium">{option.label}</span>
                                                    <p className="text-xs text-titanium-500 mt-0.5">{option.desc}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>

                                    {/* Estado actual */}
                                    <div>
                                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Estado actual</h4>
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${!customGeminiKey
                                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                                : tier === 'ultra'
                                                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                                                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            }`}>
                                            {!customGeminiKey ? (
                                                <><span>✕</span><span>Sin API Key</span></>
                                            ) : tier === 'ultra' ? (
                                                <><Zap size={11} /><span>Ultra — Key conectada</span></>
                                            ) : (
                                                <><Leaf size={11} /><span>Normal — Tu key</span></>
                                            )}
                                        </div>
                                    </div>

                                    {/* Sección de herramientas automáticas */}
                                    <div className="mt-4 pt-4 border-t border-zinc-800">
                                        <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                                            Herramientas automáticas
                                        </h4>

                                        {/* Toggle Guardián */}
                                        <div className="flex items-center justify-between py-2">
                                            <div>
                                                <p className="text-sm text-zinc-300">El Guardián del Canon</p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    {isUltra
                                                        ? 'Audita mientras escribes (cada 50 palabras)'
                                                        : 'En Modo Normal: recomendamos Manual para conservar cuota'
                                                    }
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-zinc-600">
                                                    {guardianMode === 'auto' ? 'Auto' : 'Manual'}
                                                </span>
                                                <button
                                                    onClick={() => setGuardianMode(guardianMode === 'auto' ? 'manual' : 'auto')}
                                                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${guardianMode === 'auto' ? 'bg-cyan-500' : 'bg-titanium-700'
                                                        }`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${guardianMode === 'auto' ? 'translate-x-5' : 'translate-x-0.5'
                                                        }`} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Toggle Destilador */}
                                        <div className="flex items-center justify-between py-2">
                                            <div>
                                                <p className="text-sm text-zinc-300">Destilación de recursos</p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    Analiza automáticamente los recursos al indexarlos
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-zinc-600">
                                                    {autoDistill ? 'Auto' : 'Manual'}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const next = !autoDistill;
                                                        savePreference('autoDistillResources', next);
                                                        setAutoDistill(next);
                                                    }}
                                                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${autoDistill ? 'bg-cyan-500' : 'bg-titanium-700'
                                                        }`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${autoDistill ? 'translate-x-5' : 'translate-x-0.5'
                                                        }`} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Aviso Free Tier */}
                                        {!isUltra && (
                                            <div className="mt-2 p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                                                <p className="text-xs text-amber-400/80 leading-relaxed">
                                                    💡 En Modo Normal (Free Tier), tener ambas herramientas en Manual
                                                    te da control total sobre tu cuota de 250 RPD.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* COLUMNA DERECHA — API Key */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tu API Key de Google AI Studio</h4>

                                    <div className="relative">
                                        <input
                                            id="api-key-input"
                                            type={showKey ? "text" : "password"}
                                            value={localGeminiKey}
                                            onChange={(e) => setLocalGeminiKey(e.target.value)}
                                            className="w-full bg-slate-800 text-white placeholder-gray-500 border border-slate-700 p-2.5 pr-10 rounded-xl focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none font-mono text-sm"
                                            placeholder="AIzaSy..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-titanium-400 hover:text-white transition-colors"
                                            aria-label={showKey ? "Ocultar clave" : "Mostrar clave"}
                                        >
                                            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>

                                    {localGeminiKey && (
                                        <button
                                            onClick={() => setLocalGeminiKey('')}
                                            className="text-xs text-red-400 hover:text-red-300 underline flex items-center gap-1"
                                        >
                                            <Trash2 size={11} /> Eliminar key
                                        </button>
                                    )}

                                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-lg space-y-1.5">
                                        <p className="text-xs text-emerald-400 font-medium">Google AI Studio ofrece capa gratuita</p>
                                        <p className="text-xs text-titanium-500 leading-relaxed">
                                            No necesitas tarjeta de crédito. El Modo Normal usa Gemini Flash, que es 100% gratuito con límites generosos.
                                        </p>
                                        <button
                                            onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}
                                            className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
                                        >
                                            Obtener mi API key gratuita →
                                        </button>
                                    </div>

                                    <div className="flex items-start gap-1.5">
                                        <ShieldCheck size={11} className="text-zinc-600 mt-0.5 shrink-0" />
                                        <p className="text-xs text-zinc-600 leading-relaxed">
                                            Tu key se guarda solo en tu navegador. Nunca se almacena en nuestros servidores.
                                        </p>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: MEMORY (DEBUG) */}
                    {activeTab === 'memory' && (
                        <div role="tabpanel" id="panel-memory" aria-labelledby="tab-memory" className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle size={18} className="text-red-400" />
                                <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">{t.dangerZone}</h4>
                            </div>

                            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="text-white font-bold flex items-center gap-2">
                                            <FileSearch size={16} className="text-blue-400" />
                                            {t.auditPath}
                                        </h5>
                                        <p className="text-xs text-titanium-400 mt-1">
                                            {t.auditDesc}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleAudit}
                                        disabled={isAuditing || isReindexing}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {isAuditing ? <RefreshCw className="animate-spin" size={16} /> : <FileSearch size={16} />}
                                        {isAuditing ? t.auditing : t.auditButton}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-xl space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="text-red-400 font-bold flex items-center gap-2">
                                            <Trash2 size={16} />
                                            {t.forceIndex}
                                        </h5>
                                        <p className="text-xs text-titanium-400 mt-1">
                                            <span className="text-red-400 font-bold">{t.nuclearOption}</span> {t.forceIndexDesc}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleForceReindex}
                                        disabled={isAuditing || isReindexing || isRefreshingAuth}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/30 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {isReindexing ? <RefreshCw className="animate-spin" size={16} /> : <AlertTriangle size={16} />}
                                        {isReindexing ? t.purging : t.nuclearButton}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-yellow-900/10 border border-yellow-900/30 p-4 rounded-xl space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h5 className="text-yellow-400 font-bold flex items-center gap-2">
                                            <ShieldCheck size={16} />
                                            {t.reauth}
                                        </h5>
                                        <p className="text-xs text-titanium-400 mt-1">
                                            {t.reauthDesc}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleReAuth}
                                        disabled={isAuditing || isReindexing || isRefreshingAuth}
                                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600/10 text-yellow-500 hover:bg-yellow-600/20 border border-yellow-600/30 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                    >
                                        {isRefreshingAuth ? <RefreshCw className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                        {isRefreshingAuth ? t.renewing : t.reauthButton}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: INFO (ABOUT) */}
                    {activeTab === 'info' && (
                        <div role="tabpanel" id="panel-info" aria-labelledby="tab-info" className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Info size={18} className="text-cyan-400" />
                                <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">{t.about}</h4>
                            </div>

                            <div className="p-6 bg-gradient-to-br from-titanium-900 to-titanium-950 border border-titanium-800 rounded-xl flex flex-col items-center text-center space-y-4 shadow-xl">
                                <div className="w-16 h-16 bg-cyan-900/20 rounded-full flex items-center justify-center border border-cyan-500/30 mb-2">
                                    <Sparkles size={32} className="text-cyan-400" />
                                </div>

                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    MyWorld <span className="text-cyan-500"></span>
                                </h3>

                                <div className="px-4 py-2 bg-black/40 rounded-full border border-titanium-700/50">
                                    <p className="text-xs font-mono text-cyan-300 font-medium tracking-wide">
                                        Powered by Gemini

                                    </p>
                                </div>

                                <p className="text-sm text-titanium-400 max-w-sm leading-relaxed">
                                    Plataforma de escritura creativa de próxima generación, diseñada para orquestar universos narrativos complejos con la ayuda de Inteligencia Artificial.
                                </p>
                            </div>

                            <div className="p-4 border-l-2 border-titanium-600 pl-4 space-y-2">
                                <h5 className="text-xs font-bold text-titanium-300 uppercase tracking-widest">{t.legal}</h5>
                                <p className="text-xs text-titanium-500 leading-relaxed font-mono">
                                    Este software y su código fuente son propiedad intelectual de <strong className="text-titanium-300">Deiner David Trelles Renteria</strong>.
                                    Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
                                </p>
                                <p className="text-[10px] text-titanium-600 pt-2">
                                    Licensed under Apache License 2.0
                                </p>
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
                        {t.cancel}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading || isAuditing || isReindexing}
                        className="px-5 py-2 bg-accent-DEFAULT text-titanium-950 text-sm font-bold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                        {isLoading ? t.saving : t.save}
                    </button>
                </div>
            </div>

            {/* 🟢 FILE SELECTOR MODAL FOR ANALYSIS */}
            {isAnalyzerOpen && (
                <InternalFileSelector
                    onFileSelected={(files) => {
                        // Type assertion to handle single vs multi return, though we expect array from multi-select
                        const list = Array.isArray(files) ? files : [files];
                        handleAnalyzeStyle(list);
                    }}
                    onCancel={() => setIsAnalyzerOpen(false)}
                    multiSelect={true} // 👈 Enable Multi-Select
                />
            )}
        </div>
    );
};

export default SettingsModal;
