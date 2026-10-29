import { lazyView } from './utils/lazyView';
import { ErrorBoundary } from "./components/ErrorBoundary";
/*
 * Este software y su código fuente son propiedad intelectual de Deiner David Trelles Renteria.
 * Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
 *
 * ⚠️ ADVERTENCIA DE ARQUITECTURA (CO-CHANGES)
 * ---------------------------------------------------------
 * App.tsx es el orquestador principal. Si modificas su estado, 
 * es altamente probable que rompas o debas actualizar también:
 * - src/components/VaultSidebar.tsx
 * - functions/src/index.ts
 * - src/components/ArquitectoPanel.tsx
 * - src/services/api.ts
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuth, onAuthStateChanged, User, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { callFunction } from './services/api';
import { initSecurity } from "./lib/firebase"; // 👈 IMPORT CENTRALIZED SECURITY
import { Toaster, toast } from 'sonner';
import { FileCache } from './utils/fileCache';
import { textHash } from './utils/textHash';
import VaultSidebar from './components/VaultSidebar';
import HybridEditor, { HybridEditorHandle } from './editor/HybridEditor'; // 👈 IMPORT NEW EDITOR
import { DriftMarker } from './editor/extensions/driftPlugin';
import ChatPanel from './components/ChatPanel';
import ArsenalDock from './components/forge/ArsenalDock';
import LoginScreen from './pages/LoginScreen';
import ConnectDriveModal from './components/ui/ConnectDriveModal';
import SettingsModal from './components/ui/SettingsModal';
import FieldManualModal from './components/ui/FieldManualModal';
import ProjectSettingsModal from './components/ui/ProjectSettingsModal';
import { DirectorPanel } from './components/DirectorPanel'; // 👈 IMPORT
import ArquitectoPendingWidget from './components/ArquitectoPendingWidget';
import SecurityLockScreen from './pages/SecurityLockScreen'; // 👈 IMPORT LOCK SCREEN
import SentinelStatus from './components/forge/SentinelStatus'; // 👈 IMPORT SENTINEL STATUS
import { useGuardian } from './hooks/useGuardian'; // 👈 IMPORT GUARDIAN HOOK
import { useCanonWatch } from './hooks/useCanonWatch'; // Oct 2026: Guardián pasivo
import { useNarrator } from './hooks/useNarrator'; // 🟢 IMPORT NARRATOR HOOK
import { useTutorial } from './hooks/useTutorial'; // 🟢 IMPORT TUTORIAL HOOK
import { ProjectConfigProvider, useProjectConfig } from "./contexts/ProjectConfigContext";
import { GemId } from './types';
import { Loader2, AlertTriangle } from 'lucide-react';
import SentinelShell from './layout/SentinelShell'; // 👈 IMPORT SHELL
import DonateButton from './components/DonateButton'; // 👈 IMPORT DONATE BUTTON
import { useLayoutStore } from './stores/useLayoutStore';
import { useArquitectoStore } from './stores/useArquitectoStore'; // 🟢 IMPORT STORE
import { useFileLock } from './hooks/useFileLock'; // 🟢 IMPORT LOCK HOOK
import { CreativeAuditService } from './services/CreativeAuditService';
import CreateFileModal from './components/ui/CreateFileModal';
import CreateProjectModal from './components/ui/CreateProjectModal';
import StatusBar from './components/ui/StatusBar';
import ChapterReportPanel from './components/ui/ChapterReportPanel'; // Oct 2026
import ReadingToolbar from './components/ui/ReadingToolbar';
import StartingAssistant, { GenesisAnswers } from './components/editor/StartingAssistant';
import { PostGenesisPanel } from './components/PostGenesisPanel';
import ContinueCard from './components/ui/ContinueCard';
import { APIKeyOnboarding } from './components/APIKeyOnboarding';
import { useLanguageStore } from './stores/useLanguageStore';
import { TRANSLATIONS } from './i18n/translations';

// Oct 2026: vistas pesadas con carga diferida (ver utils/lazyView)
const ForgePanel = lazyView(() => import('./components/forge/ForgePanel'));
const TribunalPanel = lazyView(() => import('./components/TribunalPanel'));
const LaboratoryPanel = lazyView(() => import('./components/LaboratoryPanel'));
const TimelinePanel = lazyView(() => import('./components/TimelinePanel'));
const ExportPanel = lazyView(() => import('./components/ExportPanel'));
const ArquitectoPanel = lazyView(() => import('./components/ArquitectoPanel'));
const WorldEnginePageV2 = lazyView(() => import('./components/WorldEngineV2/WorldEnginePageV2'));
const CanonRadar = lazyView(() => import('./components/CanonRadar'));
const PrepararSpace = lazyView(() => import('./components/preparar/PrepararSpace'));
const QuePasariaSiView = lazyView(() => import('./components/preparar/QuePasariaSiView'));
import { loadPrepararTab, type PrepararTab } from './components/preparar/tabs';
const GenesisWizardModal = lazyView(() => import('./components/genesis/GenesisWizardModal'));

interface AppContentProps {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    setOauthToken: React.Dispatch<React.SetStateAction<string | null>>;
    oauthToken: string | null;
    driveStatus: 'connected' | 'refreshing' | 'error' | 'disconnected';
    setDriveStatus: React.Dispatch<React.SetStateAction<'connected' | 'refreshing' | 'error' | 'disconnected'>>;
    handleTokenRefresh: () => Promise<string | null>;
    handleDriveLink: () => void;
    isSecurityReady: boolean;
}

// 🟢 NEW WRAPPER COMPONENT TO HANDLE LOADING STATE
function AppContent({ user, setUser, setOauthToken, oauthToken, driveStatus, setDriveStatus, handleTokenRefresh, handleDriveLink, isSecurityReady }: AppContentProps) {
    const { config, updateConfig, refreshConfig, loading: configLoading, technicalError, fileTree, isFileTreeLoading } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].toasts;
    const tApp = TRANSLATIONS[currentLanguage].app;
    const commonT = TRANSLATIONS[currentLanguage].common;

    // 🟢 GLOBAL STORE CONSUMPTION
    const { activeView, setActiveView, arquitectoWidgetVisible } = useLayoutStore();
    const { arquitectoPendingItems, setArquitectoPendingItems } = useArquitectoStore();

    // APP STATE
    const [folderId, setFolderId] = useState<string>("");
    const [selectedFileContent, setSelectedFileContent] = useState<string>("");
    const [currentFileId, setCurrentFileId] = useState<string | null>(null);
    const [currentFileName, setCurrentFileName] = useState<string>('');

    // 🟢 AUTO-SAVE STATE
    const [lastSavedContent, setLastSavedContent] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);

    // 🟢 REF SYNC FOR CLOSURE SAFETY (FILE TREE BACKGROUND UPDATE)
    const currentFileIdRef = useRef(currentFileId);
    const selectedFileContentRef = useRef(selectedFileContent);
    const lastSavedContentRef = useRef(lastSavedContent); // To detect isDirty in closure
    // Oct 2026: archivo con conflicto (cambió en Drive/Obsidian): el autoguardado espera a que el autor elija.
    const conflictFileRef = useRef<string | null>(null);
    // Oct 2026: un solo guardado a la vez. Antes, si un guardado tardaba más de 2 s (arranque en frío
    // + re-indexado), el siguiente salía con la huella vieja y el servidor lo tomaba por un cambio externo.
    const saveInFlightRef = useRef(false);
    const savePendingRef = useRef(false);
    const saveToDriveRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => { currentFileIdRef.current = currentFileId; }, [currentFileId]);
    useEffect(() => { selectedFileContentRef.current = selectedFileContent; }, [selectedFileContent]);
    useEffect(() => { lastSavedContentRef.current = lastSavedContent; }, [lastSavedContent]);
    const isDirty = selectedFileContent !== lastSavedContent;

    // 🟢 MIGRATION NOTE: Old state 'activeGemId', 'isChatOpen', etc. removed.

    const [activeDirectorSessionId, setActiveDirectorSessionId] = useState<string | null>(null); // Kept local for session tracking
    const [directorPendingMessage, setDirectorPendingMessage] = useState<string | null>(null); // Kept local for handoff
    const [pendingMessage, setPendingMessage] = useState<string | null>(null); // Kept local for chat handoff

    // 🟢 DRIFT STATE
    const [driftAlerts, setDriftAlerts] = useState<any>(null); // 👈 STORE GROUPED ALERTS
    const [isScanningDrift, setIsScanningDrift] = useState(false);

    // 🟢 NARRATOR STATE
    const {
        controls: narratorControls,
        isLoading: isNarratorLoading,
        analyze: analyzeScene,
        activeSegment
    } = useNarrator();

    // 🟢 ARQUITECTO QUIET RESTORATION
    // Restore state from config on load to ensure the widget appears if there's an analysis
    useEffect(() => {
        if (!config || configLoading) return;

        if (config.lastArquitectoAnalysis && config.arquitectoCachedPendingItems) {
            const lastAnalysis = config.lastArquitectoAnalysis;
            const lastUpdate = config.lastSignificantUpdate;

            // Same logic as useArquitecto cache check
            if (!lastUpdate || lastAnalysis > lastUpdate) {
                console.log("🏛️ [Arquitecto] Quiet restoring cached pending items:", config.arquitectoCachedPendingItems.length);
                setArquitectoPendingItems(config.arquitectoCachedPendingItems);
            }
        }
    }, [config, configLoading]);

    // 🧪 DRIFT SIMULATION (PHASE 3)
    const [driftMarkers, setDriftMarkers] = useState<DriftMarker[]>([]);

    const handleSimulateDrift = () => {
        console.log("🧪 Simulating Drift...");
        setDriftMarkers([
            { from: 0, to: 10, level: 'high' },
            { from: 50, to: 60, level: 'low' }
        ]);
        toast.info(t.driftActivated);
    };

    // 🟢 REAL-TIME CONTENT SYNC (DEBOUNCED FROM EDITOR)
    const handleContentChange = (newContent: string) => {
        setSelectedFileContent(newContent);
    };

    // 🟢 AUTO-SAVE LOGIC
    const saveToDrive = async () => {
        if (saveInFlightRef.current) { savePendingRef.current = true; return; }
        // Valores actuales desde refs (no del render en que se programó el guardado)
        const contentToSave = selectedFileContentRef.current;
        const fileIdToSave = currentFileIdRef.current;
        const lastSavedContent = lastSavedContentRef.current;

        if (!fileIdToSave || !oauthToken || !contentToSave) return;
        // Don't save if content hasn't changed from last save (redundant check but safe)
        if (contentToSave === lastSavedContent) return;
        if (conflictFileRef.current === fileIdToSave) return;

        saveInFlightRef.current = true;
        setIsSaving(true);
        try {
            // 🟢 SIGNIFICANT EDIT DETECTION
            // Trigger re-indexing only on massive changes (> 1000 words / 5000 chars) or major deletions.
            const diff = contentToSave.length - lastSavedContent.length;
            const absDiff = Math.abs(diff);

            const isMajorAdd = absDiff > 5000;
            const isMajorDelete = (diff < 0 && contentToSave.length < lastSavedContent.length * 0.5 && lastSavedContent.length > 1000);

            const isSignificant = isMajorAdd || isMajorDelete;

            const saveRes = await callFunction<{ success: boolean; conflict?: boolean; remoteContent?: string }>('saveDriveFile', {
                fileId: fileIdToSave,
                content: contentToSave,
                accessToken: oauthToken,
                isSignificant: isSignificant,
                baseHash: textHash(lastSavedContent),
            });

            // Oct 2026: el archivo cambió fuera de MyWorld (p. ej. en Obsidian). No se pisó nada.
            if (saveRes?.conflict) {
                conflictFileRef.current = fileIdToSave;
                const remote = saveRes.remoteContent ?? '';
                const fileLabel = currentFileName || 'este archivo';
                const useRemote = (id: string | number) => {
                    toast.dismiss(id);
                    try { localStorage.setItem(`myworld_conflict_backup_${fileIdToSave}`, contentToSave); } catch { /* sin almacenamiento */ }
                    conflictFileRef.current = null;
                    FileCache.set(fileIdToSave, remote);
                    lastSavedContentRef.current = remote;
                    setLastSavedContent(remote);
                    setSelectedFileContent(remote);
                    toast.success('Cargué la versión de Drive.', { description: 'Tu versión de MyWorld quedó como respaldo en este navegador.' });
                };
                const keepMine = async (id: string | number) => {
                    toast.dismiss(id);
                    try {
                        const latest = selectedFileContentRef.current || contentToSave;
                        await callFunction('saveDriveFile', { fileId: fileIdToSave, content: latest, accessToken: oauthToken, force: true });
                        conflictFileRef.current = null;
                        FileCache.set(fileIdToSave, latest);
                        lastSavedContentRef.current = latest;
                        setLastSavedContent(latest);
                        toast.success('Guardé tu versión de MyWorld.');
                    } catch {
                        toast.error(t.autoSaveError);
                    }
                };
                // Oct 2026: aviso propio (el de sonner con dos botones aplastaba el texto en una columna).
                toast.custom((id) => (
                    <div className="w-[356px] rounded-lg border border-amber-700/50 bg-titanium-900 p-4 shadow-xl text-titanium-100">
                        <p className="text-sm font-semibold">⚠️ «{fileLabel}» cambió en Drive</p>
                        <p className="mt-1 text-xs text-titanium-400 leading-relaxed">
                            La versión en Drive no es la que abriste aquí (¿Obsidian u otra pestaña?). No guardé para no borrar nada. ¿Con cuál te quedas?
                        </p>
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => keepMine(id)} className="flex-1 rounded-md bg-purple-700/80 hover:bg-purple-600 px-3 py-1.5 text-xs font-medium">Guardar la mía</button>
                            <button onClick={() => useRemote(id)} className="flex-1 rounded-md bg-titanium-800 hover:bg-titanium-700 px-3 py-1.5 text-xs font-medium">Usar la de Drive</button>
                        </div>
                    </div>
                ), { duration: Infinity });
                return;
            }

            // 🟢 CACHE UPDATE: Keep local cache in sync with saves
            FileCache.set(fileIdToSave, contentToSave);
            canonWatchNotifyRef.current(fileIdToSave, contentToSave); // Guardián pasivo (con freno)

            // ⚖️ AUDIT: LOG SIGNIFICANT WRITES
            // Only log if the edit was "significant" (>50 chars or similar heuristic from above)
            // This reduces spam and ensures we capture actual human effort.
            if (isSignificant && folderId && user) {
                CreativeAuditService.logCreativeEvent({
                    projectId: folderId,
                    userId: user.uid,
                    component: 'HybridEditor',
                    actionType: 'INJECTION',
                    description: 'Manual Writing (Significant)',
                    payload: {
                        fileId: currentFileId,
                        fileName: currentFileName,
                        timestamp: Date.now(),
                        contentSnapshot: contentToSave // 🟢 CAPTURE CONTENT
                    }
                });
            }

            // Update lastSavedContent to what we just saved (solo si sigue abierto el mismo archivo)
            if (currentFileIdRef.current === fileIdToSave) {
                lastSavedContentRef.current = contentToSave;
                setLastSavedContent(contentToSave);
            }
        } catch (error) {
            console.error("❌ Auto-save failed:", error);
            toast.error(t.autoSaveError);
        } finally {
            saveInFlightRef.current = false;
            setIsSaving(false);
            if (savePendingRef.current) {
                savePendingRef.current = false;
                setTimeout(() => { saveToDriveRef.current(); }, 0);
            }
        }
    };
    saveToDriveRef.current = saveToDrive;

    // 🟢 DEBOUNCE AUTO-SAVE EFFECT
    useEffect(() => {
        if (!isDirty || !currentFileId) return;

        const timer = setTimeout(() => {
            saveToDrive();
        }, 2000); // 2 seconds delay

        return () => clearTimeout(timer);
    }, [selectedFileContent, isDirty, currentFileId, lastSavedContent]);

    // 🟢 BEFORE UNLOAD PROTECTION
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty || isSaving) {
                e.preventDefault();
                e.returnValue = ''; // Required for Chrome
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty, isSaving]);

    // 🟢 CALCULATE EFFECTIVE CONTEXT (FALLBACK LOGIC)
    const effectiveFileContent = selectedFileContent;
    const effectiveFileName = currentFileName;
    const isFallbackContext = false; // Always live now.

    // 🛡️ GUARDIAN HOOK (ARGOS)
    const {
        status: guardianStatus,
        conflicts: guardianConflicts,
        facts: guardianFacts,
        lawConflicts: guardianLawConflicts,
        personalityDrifts: guardianPersonalityDrifts,
        resonanceMatches: guardianResonanceMatches,
        structureAnalysis: guardianStructureAnalysis,
        forceAudit
    } = useGuardian(effectiveFileContent, folderId, currentFileId || undefined);

    // 🟢 TRIGGER DRIFT SCAN WHEN DIRECTOR OPENS (ONCE PER OPEN)
    // Updated dependency to activeView
    useEffect(() => {
        if (activeView === 'director' && !driftAlerts && !isScanningDrift && folderId) {
            const scan = async () => {
                setIsScanningDrift(true);
                try {
                    console.log("📡 [SENTINEL] Triggering Deep Drift Scan...");
                    const data = await callFunction<{ success: boolean; alerts: any[] }>('scanProjectDrift', { projectId: folderId });

                    if (data && data.success && data.alerts) {
                        console.log("📡 [SENTINEL] Scan Results:", data.alerts);
                        setDriftAlerts(data.alerts);
                    }
                } catch (error) {
                    console.error("Drift Scan Error:", error);
                } finally {
                    setIsScanningDrift(false);
                }
            };
            scan();
        }
    }, [activeView, folderId]);

    // MODALES
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'ai_config'>('general');
    const [showApiKeyOnboarding, setShowApiKeyOnboarding] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [isFieldManualOpen, setIsFieldManualOpen] = useState(false);
    const [isCreateFileModalOpen, setIsCreateFileModalOpen] = useState(false);
    const [isGenesisOpen, setIsGenesisOpen] = useState(false);
    const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);

    // 🟢 UI STATE
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false); // Oct 2026: Reporte de capítulo
    const [prepararTab, setPrepararTab] = useState<PrepararTab>(loadPrepararTab); // Oct 2026: espacio Preparar
    const openReportRef = useRef<() => void>(() => {});
    const canonWatch = useCanonWatch(currentFileId, currentFileName, () => openReportRef.current());
    const canonWatchNotifyRef = useRef(canonWatch.notifySaved);
    canonWatchNotifyRef.current = canonWatch.notifySaved;
    const [showStartingAssistant, setShowStartingAssistant] = useState(false);
    const [showPostGenesisPanel, setShowPostGenesisPanel] = useState(false);
    const [showContinueCard, setShowContinueCard] = useState(false);
    const [genesisFilesCount, setGenesisFilesCount] = useState(0);
    const [genesisPremise, setGenesisPremise] = useState<string>('');
    const [arquitectoGenesisContext, setArquitectoGenesisContext] = useState<string | null>(null);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const hybridEditorRef = useRef<HybridEditorHandle>(null); // 🟢 EDITOR HANDLE
    const [fontFamily, setFontFamily] = useState<'serif' | 'sans'>('serif');
    const [editorWidth, setEditorWidth] = useState<'narrow' | 'wide'>('narrow');
    const [indexStatus, setIndexStatus] = useState<{ isIndexed: boolean; lastIndexedAt: string | null }>({ isIndexed: false, lastIndexedAt: null });
    const [initialByokChecked, setInitialByokChecked] = useState(false);

    // 🟢 BYOK ONBOARDING
    const { customGeminiKey, customAnthropicKey } = useProjectConfig();

    // Global settings modal event dispatch (from overlays, TTS gate, etc.)
    useEffect(() => {
        const handleOpenSettings = (e: Event) => {
            const tab = (e as CustomEvent).detail?.tab || 'general';
            setSettingsInitialTab(tab);
            setIsSettingsModalOpen(true);
        };
        const handleShowOnboarding = () => setShowApiKeyOnboarding(true);
        window.addEventListener('OPEN_SETTINGS_MODAL', handleOpenSettings);
        window.addEventListener('SHOW_API_KEY_ONBOARDING', handleShowOnboarding);
        return () => {
            window.removeEventListener('OPEN_SETTINGS_MODAL', handleOpenSettings);
            window.removeEventListener('SHOW_API_KEY_ONBOARDING', handleShowOnboarding);
        };
    }, []);
    useEffect(() => {
        if (!isAppLoading && user && !initialByokChecked && driveStatus === 'connected') {
            setInitialByokChecked(true);
            if (!customGeminiKey && !customAnthropicKey) {
                toast("Falta Clave de IA (BYOK)", {
                    description: "Para usar las herramientas avanzadas, necesitas configurar al menos una API Key (Google Gemini o Anthropic Claude).",
                    duration: 10000,
                    action: {
                        label: "Configurar",
                        onClick: () => setIsSettingsModalOpen(true)
                    }
                });
            }
        }
    }, [isAppLoading, user, customGeminiKey, customAnthropicKey, initialByokChecked, driveStatus]);

    // 🟢 STARTING ASSISTANT — show when project is new and empty
    const arquitectoSessionId = useArquitectoStore(state => state.arquitectoSessionId);
    const existingSession = arquitectoSessionId || activeDirectorSessionId;

    useEffect(() => {
        if (!config || configLoading || isFileTreeLoading) return;
        const hasCanon = config?.canonPaths?.length > 0;

        // Contar total de archivos en todo el árbol recursivamente
        const countFiles = (nodes: any[]): number => {
            if (!nodes || nodes.length === 0) return 0;
            return nodes.reduce((total, node) => {
                const isFile = node.mimeType !== 'application/vnd.google-apps.folder';
                const childCount = countFiles(node.children || []);
                return total + (isFile ? 1 : 0) + childCount;
            }, 0);
        };

        const totalFiles = countFiles(fileTree || []);
        // Oct 2026: el árbol se carga perezosamente (children vacíos), así que contar solo
        // archivos daba 0 en proyectos con carpetas y el asistente salía en cada carga.
        // Un proyecto con cualquier nodo (carpeta o archivo) NO está vacío.
        const totalNodes = (fileTree || []).length;
        const isEmpty = totalFiles === 0 && totalNodes === 0;
        const dismissed = (() => { try { return localStorage.getItem(`assistant_dismissed_${config?.folderId}`) === 'true'; } catch { return false; } })();
        if (isEmpty && dismissed) {
            setShowStartingAssistant(false);
            setShowContinueCard(false);
            return;
        }

        // Si el proyecto está vacío, Genesis debe aparecer siempre —
        // ignorar sesiones viejas del Arquitecto/Director y el flag de dismiss,
        // ya que el usuario puede haber borrado todo para empezar de nuevo.
        if (isEmpty) {
            setShowStartingAssistant(hasCanon);
            setShowContinueCard(false);
            return;
        }

        // Proyecto con archivos: respetar sesiones activas y el dismiss
        if (existingSession) {
            setShowStartingAssistant(false);
            setShowContinueCard(false);
            return;
        }

        setShowStartingAssistant(false);
        setShowContinueCard(hasCanon);
    }, [config?.canonPaths?.length, JSON.stringify((fileTree || []).map((f: any) => ({ id: f.id, childCount: f.children?.length || 0 }))), config?.folderId, existingSession, configLoading, config, isFileTreeLoading]);

    // 🟢 FILE LOCKING
    const { isLocked, isSelfLocked, lockedBySession } = useFileLock(currentFileId, user?.uid);
    const isReadOnly = isLocked && !isSelfLocked;

    // 🟢 TUTORIAL HOOK
    const hasConfiguredFoldersGlobal = !!(config?.folderId || config?.canonPaths?.length || config?.resourcePaths?.length);
    const isEmptyProject = (!fileTree || fileTree.length === 0) && !hasConfiguredFoldersGlobal;
    const { startTutorial } = useTutorial({
        setIsProjectSettingsOpen,
        user,
        isAppLoading,
        isEmptyProject
    });

    // 🟢 INITIALIZATION & HYDRATION
    useEffect(() => {
        // 👻 GHOST MODE: Force Mock File for UI Testing
        if (import.meta.env.VITE_JULES_MODE === 'true' && !currentFileId) {
            setCurrentFileId('mock-file-id');
            setSelectedFileContent('# Mock Content\n\nThis is a test.');
            setCurrentFileName('Mock File.md');
        }

        const initApp = async () => {
            if (!user) {
                // If no user, we are done loading (LoginScreen will show)
                setIsAppLoading(false);
                return;
            }

            if (configLoading) return; // Wait for config context to be ready

            console.log("🚀 INICIANDO HYDRATION DEL PROYECTO...");

            // 1. RESTORE TOKEN (Already done in parent)

            // 2. RESTORE PROJECT CONFIG
            const hasConfiguredFoldersGlobal = !!(config?.folderId || config?.canonPaths?.length || config?.resourcePaths?.length);
            if (hasConfiguredFoldersGlobal) {
                console.log("✅ Configuración de Proyecto (Roots/Paths) recuperada de Cloud Config.");
                // Si existe un folderId maestro, usarlo. Si no, poner un token genérico para que no sea null
                setFolderId(config?.folderId || "decentralized-project");
            } else {
                console.warn("⚠️ No Cloud Config found. Waiting for user input (Drive Connect).");
            }

            // 3. CHECK INDEX STATUS
            try {
                // 🟢 GHOST MODE BYPASS
                if (import.meta.env.VITE_JULES_MODE === 'true') {
                    console.log("👻 GHOST MODE: Bypassing Index Check");
                    setIndexStatus({ isIndexed: true, lastIndexedAt: new Date().toISOString() });
                } else {
                    if (user) {
                        const status = await callFunction<{ isIndexed: boolean, lastIndexedAt: string | null }>('checkIndexStatus');
                        console.log("🧠 Estado de Memoria:", status);
                        if (status) setIndexStatus(status);
                    }
                }
            } catch (error: any) {
                if (error.code === 'functions/unauthenticated' || error.message?.includes('unauthenticated')) {
                    console.warn("⚠️ User unauthenticated during index check. Ignoring to prevent crash.");
                } else {
                    console.error("Error checking index status:", error);
                }
            }

            // 4. DONE
            setIsAppLoading(false);
        };

        initApp();
    }, [user, config, configLoading]);

    // 🟢 SENTINEL AUDIO ALERT (THE SIREN)
    useEffect(() => {
        if (technicalError.isError) {
            const audio = new Audio('/alert.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.warn("Audio Play Blocked:", e));
        }
    }, [technicalError.isError]);


    // HANDLERS
    const handleLogout = async () => {
        const auth = getAuth();
        // 🟢 UX: Feedback Inmediato
        const toastId = toast.loading(t.loggingOut);

        try {
            // 🟢 PERSISTENCIA DE SESIÓN:
            // Ya no revocamos el token de Drive al salir.
            // Esto permite que al volver a entrar, el backend recuerde la conexión (Refresh Token).
            // Si el usuario quiere desconectar Drive, deberá hacerlo explícitamente (Futura función).
            console.log("Preserving Drive Link for next session...");

        } catch (error) {
            console.error("Logout preparation error", error);
        } finally {
            // 🟢 SIEMPRE CERRAR SESIÓN
            await signOut(auth);

            setFolderId("");
            setSelectedFileContent("");
            setLastSavedContent(""); // 🟢 RESET BASELINE
            setCurrentFileId(null);
            setOauthToken(null);
            setDriveStatus('disconnected');

            toast.dismiss(toastId);
            
            // Redirect to landing page on logout
            window.location.href = '/';
        }
    };

    // Oct 2026: el Reporte reúne el Tribunal y el Guardián; se abre sobre el editor.
    const openReport = () => {
        if (!currentFileId) { toast.info('Abre un capítulo para pedir su reporte.'); return; }
        if (isReportOpen) { setIsReportOpen(false); return; }
        setActiveView('editor');
        setIsReportOpen(true);
    };
    openReportRef.current = () => { setActiveView('editor'); setIsReportOpen(true); };

    // Oct 2026: los accesos viejos (Forja, Nexus, Laboratorio) abren su pestaña dentro de Preparar.
    useEffect(() => {
        const map: Record<string, PrepararTab> = { forja: 'personajes', perforador: 'mapa', laboratorio: 'quepasa' };
        if (map[activeView]) { setPrepararTab(map[activeView]); setActiveView('arquitecto'); }
    }, [activeView]);

    const handleGemSelect = (id: GemId) => {
        // Toggle behavior if clicking the same active tool?
        // Actually, if I am in 'forge' and click 'forge' again, I might want to go back to 'editor'?
        // The user requirement says: "Al cerrarlo, debe volver [a editor]."
        // It doesn't explicitly say clicking the icon toggles it, but standard dock behavior implies it.
        // Let's implement toggle logic for convenience.
        if (activeView === id) {
            setActiveView('editor');
        } else {
            setActiveView(id);
        }
    };

    const handleCommandExecution = async (message: string, tool: GemId) => {
        if (tool === 'director') {
            // 🟢 HANDOFF TO DIRECTOR PANEL
            setDirectorPendingMessage(message);
            setActiveView('director');
            return;
        }

        // Generic chat or specific tool chat (mapped to generic 'chat' view for now unless it has a dedicated panel)
        // Previous logic: setActiveGemId(tool); setIsChatOpen(true);
        // New logic: Check if tool has a dedicated view.
        // If not, use 'chat' view and set active context.
        // But wait, `activeView` replaces `activeGemId`.
        // If I setActiveView('perforator'), I get the Panel.
        // If the command is for Perforator, I probably want to open the Perforator Panel?
        // Or the Chat with Perforator context?
        // Old logic: `setIsChatOpen(true)` implies Sidebar Chat.
        // If I want Sidebar Chat for a tool, I should use `setActiveView('chat')`.
        // But I need to know WHICH tool context.
        // Phase 1 doesn't specify deep chat context refactor, just layout.
        // Let's assume for now commands go to 'chat' view unless it's Director.

        setActiveView('chat'); // Generic chat view
        // Ideally we pass `tool` as context to ChatPanel, but ChatPanel props need to handle it.
        // For Phase 1, we will just open the Chat.

        setPendingMessage(message);
    };

    // 🧠 LÓGICA DE INDEXADO (BOTÓN ROJO)
    const executeIndexing = async () => {
        if (!config) {
            toast.error(t.configError);
            return;
        }

        const allPaths = [...(config.canonPaths || []), ...(config.resourcePaths || [])];
        const folderIds = allPaths.map(p => p.id);

        // 🟢 STRICT INDEXING: NO FALLBACK
        // If folderIds is empty, we send an empty list. The backend will interpret this as "Clear Index".
        // if (folderIds.length === 0 && config.folderId) { folderIds.push(config.folderId); } // REMOVED

        try {
            console.log("Iniciando indexado estricto...", folderIds);

            // Oct 2026: progreso en vivo desde Firestore (users/{uid}/profile/index_status).
            // Si el navegador deja de esperar (5 min) pero el servidor sigue indexando,
            // NO es un error: seguimos mostrando el progreso hasta que termine.
            const uid = getAuth().currentUser?.uid;
            const toastId = toast.loading('Indexando base de conocimiento...');
            const startedAt = Date.now();
            let finished = false;
            let unsub: (() => void) | null = null;
            const STALE_MS = 5 * 60 * 1000;
            const finishOk = (msg: string) => {
                if (finished) return; finished = true; unsub?.();
                setIndexStatus({ isIndexed: true, lastIndexedAt: new Date().toISOString() });
                refreshConfig();
                toast.success(`¡Aprendizaje completado! ${msg}`, { id: toastId, duration: 10000 });
            };
            const finishErr = (msg: string) => {
                if (finished) return; finished = true; unsub?.();
                toast.error(msg, { id: toastId, duration: 12000 });
            };
            if (uid) {
                unsub = onSnapshot(doc(getFirestore(), 'users', uid, 'profile', 'index_status'), (snap) => {
                    const st: any = snap.data();
                    if (!st || finished) return;
                    // Ignorar estados de una indexación anterior
                    if (st.startedAt && new Date(st.startedAt).getTime() < startedAt - 60_000) return;
                    if (st.state === 'running') {
                        const prog = st.total ? ` (${st.done || 0}/${st.total} archivos)` : '';
                        toast.loading(`Indexando base de conocimiento${prog}...`, { id: toastId });
                    } else if (st.state === 'done') {
                        finishOk(st.message || '');
                    }
                });
            }

            try {
                const result = await callFunction<{ success: boolean; message: string }>('indexTDB', {
                    folderIds: folderIds,
                    projectId: config.folderId || folderId,
                    accessToken: oauthToken,
                    forceFullReindex: false
                });
                finishOk((result as any)?.message || '');
            } catch (err: any) {
                // ¿Error real o el navegador se cansó de esperar?
                let stillRunning = false;
                try {
                    if (uid) {
                        const snap = await getDoc(doc(getFirestore(), 'users', uid, 'profile', 'index_status'));
                        const st: any = snap.data();
                        if (st?.state === 'done' && st.startedAt && new Date(st.startedAt).getTime() >= startedAt - 60_000) {
                            finishOk(st.message || ''); return;
                        }
                        stillRunning = st?.state === 'running' && !!st.updatedAt && (Date.now() - new Date(st.updatedAt).getTime()) < STALE_MS;
                    }
                } catch { /* sin acceso al estado: tratar como error */ }
                if (stillRunning) {
                    toast.loading('La indexación sigue en el servidor (es normal si tienes muchos archivos). Puedes seguir escribiendo; te aviso al terminar.', { id: toastId });
                    // Vigilancia: si el estado deja de actualizarse 5 min, es un fallo real
                    const watchdog = setInterval(async () => {
                        if (finished) { clearInterval(watchdog); return; }
                        try {
                            const snap = await getDoc(doc(getFirestore(), 'users', uid!, 'profile', 'index_status'));
                            const st: any = snap.data();
                            if (st?.state === 'running' && st.updatedAt && Date.now() - new Date(st.updatedAt).getTime() > STALE_MS) {
                                clearInterval(watchdog);
                                finishErr('La indexación se detuvo sin terminar. Vuelve a pulsar indexar: continuará donde quedó.');
                            }
                        } catch { /* reintenta en el siguiente ciclo */ }
                    }, 60_000);
                } else {
                    console.error(err);
                    finishErr('Error al indexar: ' + (err?.message || 'desconocido') + '. Vuelve a intentarlo; lo ya indexado no se pierde.');
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    // 🟢 HANDLE UPDATE MEMORY (GOD MODE)
    const handleUpdateMemory = async () => {
        if (!folderId) {
            toast.warning(t.connectFolderFirst);
            return;
        }

        try {
            const promise = callFunction<{ success: boolean; fileCount?: number; count?: number; files?: number }>('updateLongTermMemory', {
                accessToken: oauthToken,
                folderId: folderId
            });

            toast.promise(promise, {
                loading: 'Generando Memoria Profunda (Omnisciencia)...',
                success: (result: any) => {
                    refreshConfig();
                    return `¡Memoria Activada! ${result.fileCount ?? result.count ?? result.files ?? '?'} archivos cargados.`;
                },
                error: 'Error al cargar memoria. Revisa que tus archivos Canon sean texto.',
            });

            await promise;
        } catch (error) {
            console.error("Memory Update Error:", error);
        }
    };

    const handleIndex = () => {
        const displayDate = config?.lastIndexed || indexStatus.lastIndexedAt;

        if (indexStatus.isIndexed) {
            toast(t.memorySynced, {
                description: `${t.lastUpdate}${displayDate ? new Date(displayDate).toLocaleDateString() : t.unknown}`,
                action: {
                    label: t.relearn,
                    onClick: () => executeIndexing()
                },
            });
            return;
        }

        if (!folderId) {
            toast.warning(t.connectFolderFirst);
            return;
        }

        toast(t.learningProtocol, {
            description: t.learningProtocolDesc,
            action: {
                label: commonT.confirm,
                onClick: () => executeIndexing()
            },
        });
    };

    // 🟢 HANDLE TIMELINE FILE SELECT
    const handleTimelineFileSelect = async (fileId: string) => {
        setActiveView('editor'); // Go back to editor to show content
        setSelectedFileContent(commonT.loading);
        setCurrentFileId(fileId);

        try {
            const data = await callFunction<{ content: string; name: string }>('getDriveFileContent', { fileId, accessToken: oauthToken });
            setSelectedFileContent(data.content);
            setLastSavedContent(data.content); // 🟢 SYNC BASELINE
            setCurrentFileName(data.name);
        } catch (error) {
            console.error("Error loading file from timeline:", error);
            toast.error(t.openError);
            setSelectedFileContent("");
            setLastSavedContent("");
        }
    };

    // 🟢 HANDLE NEW FILE CREATED
    const handleFileCreated = (id: string, content: string, name: string) => {
        setCurrentFileId(id);
        setSelectedFileContent(content);
        setLastSavedContent(content);
        setCurrentFileName(name);
        refreshConfig();
    };

    // 🟢 HANDLE TTS SELECTION
    const handleReadSelection = async (text: string) => {
        if (!text) return;
        if (!customGeminiKey) {
            toast.warning("La narración necesita una clave de Gemini.", {
                description: "Pega tu clave de AI Studio en Ajustes (la gratuita sirve).",
                action: {
                    label: 'Ajustes',
                    onClick: () => {
                        setSettingsInitialTab('ai_config');
                        setIsSettingsModalOpen(true);
                    }
                }
            });
            return;
        }
        await analyzeScene(text, []);
    };

    // 🟢 HANDLE INSERT CONTENT (Director -> Editor)
    const handleInsertContent = useCallback(async (text: string) => {
        // Use refs to avoid re-creation on typing
        const content = selectedFileContentRef.current;
        const fileId = currentFileIdRef.current;

        if (!content && !fileId) {
            toast.error(t.noFileOpen);
            return;
        }

        // 🟢 SMART INTEGRATION PROTOCOL
        if (hybridEditorRef.current) {
            const toastId = toast.loading(t.integrating, {
                description: t.weavingDesc
            });

            try {
                // 1. Get Context
                const context = hybridEditorRef.current.getCursorContext();

                // 2. Call Backend
                const result = await callFunction<{ success: boolean; text: string }>('integrateNarrative', {
                    suggestion: text,
                    precedingContext: context.preceding,
                    followingContext: context.following
                });

                if (result.success && result.text) {
                    // 3. Insert Result
                    hybridEditorRef.current.insertAtCursor(result.text);

                    // 🟢 THE SPY: LOG AI GENERATION
                    if (folderId && user) {
                        CreativeAuditService.updateAuditStats(folderId, user.uid, 0, result.text.length);
                        CreativeAuditService.logCreativeEvent({
                            projectId: folderId,
                            userId: user.uid,
                            component: 'DirectorPanel',
                            actionType: 'INJECTION',
                            description: 'Smart Narrative Insertion',
                            payload: { length: result.text.length, originalSuggestion: text }
                        });
                    }

                    toast.dismiss(toastId);
                    toast.success(t.integrated);
                } else {
                    throw new Error("Respuesta vacía del servidor.");
                }

            } catch (error) {
                console.error("Smart Insert Error:", error);
                toast.dismiss(toastId);
                toast.error(t.integrationFailed);

                // Fallback: Raw Insert
                hybridEditorRef.current.insertAtCursor(text);
            }
        } else {
            // Fallback if ref is missing
            const newContent = content ? (content + "\n\n" + text) : text;
            setSelectedFileContent(newContent);
            toast.warning(t.editorDisconnected);
        }
    }, [t, folderId, user]);

    const handleFileSelect = useCallback((id: string, content: string, name?: string, isBackgroundUpdate?: boolean) => {
        // 🟢 LOGIC:
        // If isBackgroundUpdate is true, we verify against LIVE state (Refs).
        // If false (User Click), we switch unconditionally.

        if (isBackgroundUpdate) {
            // 1. Verify we are still on the same file
            if (id !== currentFileIdRef.current) {
                // User switched to another file while this one was loading. Ignore.
                return;
            }

            // 2. Verify content is actually different
            if (content === selectedFileContentRef.current) {
                return;
            }

            // 3. Check for unsaved changes (Dirty State)
            const isDirtyRef = selectedFileContentRef.current !== lastSavedContentRef.current;
            if (isDirtyRef) {
                // 🛑 SAFETY: User has unsaved edits. Do not overwrite.
                toast.warning(t.versionConflict, {
                    description: t.versionConflictDesc
                });
            } else {
                // ✅ SAFE: Upgrade content
                setSelectedFileContent(content);
                setLastSavedContent(content);
            }
        } else {
            // 🔴 STANDARD USER SWITCH
            setCurrentFileId(id);
            setSelectedFileContent(content);
            setLastSavedContent(content);
            setCurrentFileName(name || 'Documento');
        }
    }, [t]);

    // 🟢 LOADING GATE
    if (isAppLoading) {
        return (
            <div className="h-screen w-screen bg-titanium-950 flex flex-col items-center justify-center text-titanium-200 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
                <p className="text-sm font-mono tracking-widest opacity-70">{tApp.loadingSystems}</p>
            </div>
        );
    }

    // --- SENTINEL SHELL LOGIC (UNIFIED) ---

    // 2. Render Panel C Content (The Arsenal & Side Tools)
    const renderZoneCContent = () => {
        // A) Arsenal Dock (Always Visible in Zone C container)
        // We pass activeView as activeGemId for highlighting
        // Note: SentinelShell manages the container width.
        const dock = (
            <ArsenalDock
                activeGemId={activeView as GemId}
                onGemSelect={handleGemSelect}
                onSimulateDrift={import.meta.env.VITE_JULES_MODE === 'true' ? handleSimulateDrift : undefined}
                isSecurityReady={isSecurityReady}
                onToggleSentinel={() => setActiveView(activeView === 'sentinel' ? 'editor' : 'sentinel')}
                onOpenReport={openReport}
                reportActive={isReportOpen}
            />
        );

        // B) Expanded Content (Based on activeView)
        let expandedContent: React.ReactNode = null;

        if (activeView === 'sentinel') {
            expandedContent = (
                <SentinelStatus
                    onClose={() => setActiveView('editor')}
                    isSecurityReady={isSecurityReady}
                    isOffline={!driveStatus || driveStatus === 'disconnected' || driveStatus === 'error' || !isSecurityReady}
                    accessToken={oauthToken}
                />
            );
        } else if (activeView === 'director') {
            expandedContent = (
                <ErrorBoundary>
                    <DirectorPanel
                        isOpen={true}
                        onClose={() => setActiveView('editor')}
                        activeSessionId={activeDirectorSessionId}
                        onSessionSelect={setActiveDirectorSessionId}
                        pendingMessage={directorPendingMessage}
                        onClearPendingMessage={() => setDirectorPendingMessage(null)}
                        activeFileContent={effectiveFileContent}
                        activeFileName={effectiveFileName}
                        activeFileId={currentFileId}
                        isFallbackContext={isFallbackContext}
                        folderId={folderId}
                        driftAlerts={driftAlerts}
                        accessToken={oauthToken}
                        onInsertContent={handleInsertContent}
                    />
                </ErrorBoundary>
            );
        } else if (activeView === 'tribunal') {
            expandedContent = (
                <ErrorBoundary>
                    <TribunalPanel
                        onClose={() => setActiveView('editor')}
                        initialText={selectedFileContent}
                        currentFileId={currentFileId}
                        accessToken={oauthToken}
                    />
                </ErrorBoundary>
            );
        } else if (activeView === 'guardian') {
            expandedContent = (
                <CanonRadar
                    status={guardianStatus}
                    facts={guardianFacts}
                    conflicts={guardianConflicts}
                    lawConflicts={guardianLawConflicts}
                    personalityDrifts={guardianPersonalityDrifts}
                    resonanceMatches={guardianResonanceMatches}
                    structureAnalysis={guardianStructureAnalysis}
                    onClose={() => setActiveView('editor')}
                    onForceAudit={forceAudit}
                    accessToken={oauthToken}
                />
            );
        } else if (activeView === 'chat') {
            expandedContent = (
                <ChatPanel
                    isOpen={true}
                    onClose={() => setActiveView('editor')}
                    activeGemId={null} // Generic chat for now
                    initialMessage={pendingMessage}
                    isFullWidth={true}
                    folderId={folderId}
                    activeFileContent={effectiveFileContent}
                    activeFileName={effectiveFileName}
                    isFallbackContext={isFallbackContext}
                />
            );
        }

        return (
            <>
                {dock}

                <div className="flex-1 min-w-0 h-full overflow-hidden">
                    {expandedContent}
                </div>
            </>
        );
    };

    // 3. Render Zone B Content (Main Stage)
    // 🟢 STARTING ASSISTANT GENESIS HANDLER
    const handleStartGenesis = async (answers: GenesisAnswers) => {
        try {
            toast.loading("Generando tu proyecto...", { id: 'genesis' });
            const result = await callFunction('genesisManifest', {
                answers,
                accessToken: oauthToken,
                chatHistory: [{ role: 'user', message: answers.premise || 'Inicio del proyecto.' }]
            });
            toast.success('¡Proyecto creado!', {
                id: 'genesis',
                description: 'Tu estructura está lista en Google Drive.'
            });

            // Cerrar StartingAssistant y mostrar PostGenesisPanel
            setShowStartingAssistant(false);
            localStorage.setItem(`assistant_dismissed_${config?.folderId}`, 'true');

            const count = (result as any)?.created?.length
                || (result as any)?.filesCreated?.length
                || 3;
            setGenesisFilesCount(count);
            setGenesisPremise(answers.premise || '');
            setShowPostGenesisPanel(true);

            return result;
        } catch (err: any) {
            toast.error('Error al crear el proyecto.', { id: 'genesis' });
            throw err;
        }
    };

    const renderZoneBContent = () => {
        // Oct 2026: Arquitecto, Mapa (Nexus), Personajes (Forja) y «Qué pasaría si» (Laboratorio) viven en Preparar.
        if (activeView === 'arquitecto' || activeView === 'forja' || activeView === 'perforador' || activeView === 'laboratorio') {
            return (
                <PrepararSpace
                    tab={prepararTab}
                    onTabChange={setPrepararTab}
                    views={{
                        conversacion: (
                            <ArquitectoPanel
                                onClose={() => setActiveView('editor')}
                                accessToken={oauthToken}
                                folderId={folderId}
                                onPendingItemsUpdate={setArquitectoPendingItems}
                                genesisContext={arquitectoGenesisContext}
                                onGenesisContextConsumed={() => setArquitectoGenesisContext(null)}
                            />
                        ),
                        mapa: (
                            <ErrorBoundary>
                                <WorldEnginePageV2
                                    isOpen={true}
                                    onClose={() => setActiveView('editor')}
                                    activeGemId={'perforador'}
                                    accessToken={oauthToken}
                                    onRefreshTokens={handleTokenRefresh}
                                />
                            </ErrorBoundary>
                        ),
                        personajes: (
                            <ErrorBoundary>
                                <ForgePanel onClose={() => setActiveView('editor')} folderId={folderId} accessToken={oauthToken} />
                            </ErrorBoundary>
                        ),
                        quepasa: <QuePasariaSiView accessToken={oauthToken} onOpenFile={handleTimelineFileSelect} />,
                    }}
                />
            );
        }
        if (activeView === 'forja') {
            return (
                <ErrorBoundary>
                    <ForgePanel
                        onClose={() => setActiveView('editor')}
                        folderId={folderId}
                        accessToken={oauthToken}
                    />
                </ErrorBoundary>
            );
        }
        if (activeView === 'perforador') {
            return (
                <ErrorBoundary>
                    <WorldEnginePageV2
                        isOpen={true}
                        onClose={() => setActiveView('editor')}
                        activeGemId={'perforador'}
                        accessToken={oauthToken}
                        onRefreshTokens={handleTokenRefresh}
                    />
                </ErrorBoundary>
            );
        }
        if (activeView === 'laboratorio') {
            return (
                <LaboratoryPanel
                    onClose={() => setActiveView('editor')}
                    folderId={folderId}
                    accessToken={oauthToken}
                    onRefreshTokens={handleTokenRefresh}
                />
            );
        }
        if (activeView === 'cronograma') {
            return (
                <TimelinePanel
                    onClose={() => setActiveView('editor')}
                    userId={user?.uid || null}
                    onFileSelect={handleTimelineFileSelect}
                    currentFileId={currentFileId}
                    accessToken={oauthToken}
                    isSecurityReady={isSecurityReady}
                />
            );
        }
        if (activeView === 'imprenta') {
            return (
                <ExportPanel
                    onClose={() => setActiveView('editor')}
                    folderId={folderId}
                    accessToken={oauthToken}
                />
            );
        }
        if (activeView === 'arquitecto') {
            return (
                <ArquitectoPanel
                    onClose={() => setActiveView('editor')}
                    accessToken={oauthToken}
                    folderId={folderId}
                    onPendingItemsUpdate={setArquitectoPendingItems}
                    genesisContext={arquitectoGenesisContext}
                    onGenesisContextConsumed={() => setArquitectoGenesisContext(null)}
                />
            );
        }

        // Default: Editor
        if (!currentFileId) {
            if (showStartingAssistant) {
                return (
                    <StartingAssistant
                        projectName={config?.projectName || 'Mi Proyecto'}
                        onClose={() => {
                            setShowStartingAssistant(false);
                            localStorage.setItem(`assistant_dismissed_${config?.folderId}`, 'true');
                        }}
                        onStartGenesis={handleStartGenesis}
                    />
                );
            }
            if (showPostGenesisPanel) {
                return (
                    <PostGenesisPanel
                        projectName={config?.projectName || 'Mi Proyecto'}
                        filesCreated={genesisFilesCount}
                        premise={genesisPremise}
                        onGoToCapitulo={() => {
                            setShowPostGenesisPanel(false);
                            setDirectorPendingMessage(
                                `Mi proyecto "${config?.projectName || 'Mi Proyecto'}" acaba de nacer.` +
                                (genesisPremise ? ` La premisa es: "${genesisPremise}".` : '') +
                                ` Voy a escribir el Capítulo 01. Hazme las 3 preguntas que me ayuden a encontrar mi punto de entrada a la historia.`
                            );
                            setActiveView('director');
                        }}
                        onGoToArquitecto={() => {
                            setShowPostGenesisPanel(false);
                            setArquitectoGenesisContext(
                                `Mi proyecto "${config?.projectName || 'Mi Proyecto'}" acaba de nacer del Génesis.` +
                                (genesisPremise ? ` La premisa central es: "${genesisPremise}".` : '') +
                                ` Analiza esta premisa, identifica sus fortalezas y tensiones narrativas, y dame un diagnóstico inicial del estado estructural del proyecto para comenzar a construirlo.`
                            );
                            setActiveView('arquitecto');
                        }}
                        onDismiss={() => setShowPostGenesisPanel(false)}
                    />
                );
            }
            if (showContinueCard) {
                return (
                    <ContinueCard
                        projectName={config?.projectName || ''}
                        onGoToArquitecto={() => setActiveView('arquitecto')}
                        onGoToDirector={() => setActiveView('director')}
                    />
                );
            }
            return (
                <div className="flex-1 flex items-center justify-center bg-titanium-950">
                    <div className="text-titanium-500 font-mono text-sm opacity-50">
                        Selecciona un archivo del canon para comenzar.
                    </div>
                </div>
            );
        }

        return (
            <div className="flex h-full overflow-hidden">
                {/* Main editor column */}
                <div className="flex flex-col flex-1 overflow-hidden relative group/editor-area">
                    {/* Drive disconnected overlay */}
                    {driveStatus !== 'connected' && (
                        <div className="absolute inset-0 bg-titanium-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 gap-4">
                            <div className="bg-titanium-900 border border-amber-500/30 rounded-xl p-6 max-w-[360px] text-center">
                                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
                                    <span className="text-amber-400 text-xl">⚡</span>
                                </div>
                                <h3 className="text-[14px] font-medium text-titanium-200 mb-2">
                                    Google Drive no conectado
                                </h3>
                                <p className="text-[12px] text-titanium-500 leading-relaxed mb-4">
                                    MyWorld guarda tu proyecto directamente en tu Google Drive. Necesitas conectarlo para empezar a escribir.
                                </p>
                                <button
                                    onClick={handleDriveLink}
                                    className="w-full py-2.5 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[13px] font-medium rounded-lg hover:bg-cyan-500/25 transition-all"
                                >
                                    Conectar Google Drive
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 🟢 READING TOOLBAR (Floating) */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 opacity-0 group-hover/editor-area:opacity-100 transition-opacity duration-300 pointer-events-none hover:!opacity-100 focus-within:!opacity-100">
                        <div className="pointer-events-auto">
                            <ReadingToolbar
                                fontFamily={fontFamily}
                                setFontFamily={setFontFamily}
                                editorWidth={editorWidth}
                                setEditorWidth={setEditorWidth}
                                isZenMode={isZenMode}
                                setIsZenMode={setIsZenMode}
                            />
                        </div>
                    </div>

                    <div
                        className="flex-1 overflow-hidden relative transition-all duration-300"
                        style={{
                            '--editor-font-family': fontFamily === 'sans' ? 'var(--font-display)' : 'var(--font-serif)',
                            '--editor-max-width': editorWidth === 'wide' ? '100%' : '800px'
                        } as React.CSSProperties}
                    >
                        <HybridEditor
                            ref={hybridEditorRef}
                            content={selectedFileContent}
                            onContentChange={handleContentChange}
                            driftMarkers={driftMarkers}
                            activeSegment={activeSegment}
                            className="h-full"
                            readOnly={isReadOnly}
                            onReadSelection={handleReadSelection}
                            narratorState={{
                                isPlaying: narratorControls.isPlaying,
                                isLoading: isNarratorLoading,
                                stop: narratorControls.stop
                            }}
                        />
                    </div>
                    {isReportOpen && currentFileId && (
                        <ChapterReportPanel
                            key={currentFileId}
                            fileId={currentFileId}
                            fileName={currentFileName || 'Capítulo'}
                            accessToken={oauthToken}
                            watchAlerts={canonWatch.alerts}
                            getText={() => hybridEditorRef.current?.getText() || selectedFileContentRef.current || ''}
                            reveal={(from, to) => hybridEditorRef.current?.revealRange(from, to)}
                            replace={(from, to, text) => hybridEditorRef.current?.replaceRange(from, to, text)}
                            onClose={() => setIsReportOpen(false)}
                        />
                    )}
                    <StatusBar
                        content={selectedFileContent}
                        guardianStatus={canonWatch.status}
                        onGuardianClick={openReport}
                        onOpenSettings={() => {
                            setSettingsInitialTab('ai_config');
                            setIsSettingsModalOpen(true);
                        }}
                        className="z-50 shrink-0"
                        onOpenReport={currentFileId ? () => setIsReportOpen(true) : undefined}
                        narratorControls={{
                            ...narratorControls,
                            isLoading: isNarratorLoading
                        }}
                    />
                </div>

            </div>
        );
    };

    return (
        <>
            <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: '#09090b',
                        border: '1px solid #27272a',
                        color: '#e4e4e7',
                    },
                    className: 'z-50',
                }}
            />

            <ConnectDriveModal
                isOpen={isConnectModalOpen}
                onClose={() => setIsConnectModalOpen(false)}
                onSubmit={(id) => {
                    setFolderId(id);
                    if (config) {
                        updateConfig({ ...config, folderId: id });
                    }
                }}
            />

            {isSettingsModalOpen && (
                <SettingsModal
                    onClose={() => setIsSettingsModalOpen(false)}
                    onSave={(url) => {
                        setFolderId(url);
                    }}
                    accessToken={oauthToken}
                    onGetFreshToken={handleTokenRefresh}
                    initialTab={settingsInitialTab}
                />
            )}

            {showApiKeyOnboarding && (
                <APIKeyOnboarding onClose={() => setShowApiKeyOnboarding(false)} />
            )}

            {isProjectSettingsOpen && (
                <ProjectSettingsModal
                    onClose={() => setIsProjectSettingsOpen(false)}
                    accessToken={oauthToken}
                />
            )}

            {isFieldManualOpen && (
                <FieldManualModal onClose={() => setIsFieldManualOpen(false)} />
            )}

            <CreateFileModal
                isOpen={isCreateFileModalOpen}
                onClose={() => setIsCreateFileModalOpen(false)}
                onFileCreated={handleFileCreated}
                accessToken={oauthToken}
            />

            <GenesisWizardModal
                isOpen={isGenesisOpen}
                onClose={() => setIsGenesisOpen(false)}
                accessToken={oauthToken}
                onRefreshTokens={handleTokenRefresh}
            />

            <CreateProjectModal
                isOpen={isCreateProjectModalOpen}
                onClose={() => setIsCreateProjectModalOpen(false)}
                onSubmit={async (name) => {
                    try {
                        toast.info(t.creatingStructure);
                        await callFunction('createTitaniumStructure', {
                            accessToken: oauthToken,
                            newProjectName: name
                        });
                        toast.success("¡Proyecto creado exitosamente!");
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } catch (error: any) {
                        console.error("Error creating project:", error);
                        toast.error("Error al crear el proyecto: " + error.message);
                        throw error;
                    }
                }}
            />

            <div className="flex flex-col h-screen w-screen overflow-hidden">
                <div className="flex-1 overflow-hidden">
                <SentinelShell
                    isZenMode={isZenMode}
                    // Props removed in SentinelShell refactor are implicitly handled via store
                    sidebar={
                        <VaultSidebar
                            folderId={folderId}
                            onFolderIdChange={setFolderId}
                            onFileSelect={handleFileSelect}
                            onOpenConnectModal={() => setIsConnectModalOpen(true)}
                            onLogout={handleLogout}
                            onIndexRequest={handleIndex}
                            onUpdateMemory={handleUpdateMemory}
                            onOpenSettings={() => setIsSettingsModalOpen(true)}
                            onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
                            accessToken={oauthToken}
                            onRefreshTokens={driveStatus === 'disconnected' || driveStatus === 'error' ? handleDriveLink : handleTokenRefresh}
                            driveStatus={driveStatus}
                            onOpenManual={() => setIsFieldManualOpen(true)}
                            isIndexed={indexStatus.isIndexed}
                            isSecurityReady={isSecurityReady}
                            activeFileId={currentFileId}
                            onCreateFile={() => setIsCreateFileModalOpen(true)}
                            onFileCreated={handleFileCreated}
                            onGenesis={() => setIsGenesisOpen(true)}
                            onStartTutorial={startTutorial}
                            onOpenStartingAssistant={() => {
                                setShowStartingAssistant(true);
                                localStorage.removeItem(`assistant_dismissed_${config?.folderId}`);
                            }}
                        />
                    }
                    editor={renderZoneBContent()}
                    tools={renderZoneCContent()}
                />
            </div>
            </div>
        </>
    );
}

function App() {
    console.log("🚀 App Mounting...");
    if (import.meta.env.DEV) {
        console.log("👻 JULES MODE:", import.meta.env.VITE_JULES_MODE);
        console.log("🛠️ DEV MODE:", import.meta.env.DEV);
    }

    // 1. ALL HOOKS FIRST (Unconditional)

    // 🛡️ SECURITY STATE
    const [isSecurityReady, setIsSecurityReady] = useState(false);
    const [securityError, setSecurityError] = useState<string | null>(null);

    // AUTH LIFTED STATE
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [oauthToken, setOauthToken] = useState<string | null>(null);
    const [driveStatus, setDriveStatus] = useState<'connected' | 'refreshing' | 'error' | 'disconnected'>('disconnected');

    // 🛡️ APP CHECK INITIALIZATION (SECURITY HANDSHAKE)
    useEffect(() => {
        const init = async () => {
            const status = await initSecurity();
            if (status.isReady) {
                setIsSecurityReady(true);
            } else {
                setSecurityError(status.error);
            }
        };
        init();

        const taxonomyToast = localStorage.getItem('show_taxonomy_toast');
        if (taxonomyToast === 'true') {
            localStorage.removeItem('show_taxonomy_toast');
            setTimeout(() => {
                toast.success(
                    'Carpetas categorizadas automáticamente.',
                    {
                        description: 'Puedes ajustar la taxonomía en Configuración → Proyecto.',
                        duration: 6000
                    }
                );
            }, 2000);
        }
    }, []);

    // AUTH LISTENER
    useEffect(() => {
        // 👻 GHOST ACCESS: BYPASS AUTH IN DEV
        if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
            console.warn("👻 GHOST ACCESS ENABLED: Skipping Google Auth");
            setUser({
                uid: 'jules-dev',
                email: 'jules@internal.test',
                displayName: 'Jules Agent',
                emailVerified: true,
                isAnonymous: false,
                metadata: {},
                providerData: [],
                refreshToken: '',
                tenantId: null,
                delete: async () => { },
                getIdToken: async () => 'mock-token',
                getIdTokenResult: async () => ({} as any),
                reload: async () => { },
                toJSON: () => ({})
            } as unknown as User);
            setOauthToken('mock-token');
            setAuthLoading(false);
            setDriveStatus('connected');
            return;
        }

        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
            setDriveStatus('disconnected');
        });
        return () => unsubscribe();
    }, []);

    const handleDriveLink = () => {
        // 🟢 GOOGLE IDENTITY SERVICES (GIS) CODE FLOW
        // Requires VITE_GOOGLE_CLIENT_ID to be set in .env
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

        if (!clientId) {
            toast.error("Falta VITE_GOOGLE_CLIENT_ID en configuración");
            console.error("Missing VITE_GOOGLE_CLIENT_ID");
            return;
        }

        if (!window.google) {
            toast.error("Google Identity Services no cargado.");
            return;
        }

        const client = window.google.accounts.oauth2.initCodeClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            ux_mode: 'popup',
            prompt: 'consent', // 👈 FORCE REFRESH TOKEN GENERATION
            callback: async (response: any) => {
                if (response.code) {
                    const toastId = toast.loading("Vinculando Drive permanentemente...");
                    try {
                        const data = await callFunction<{ success: boolean; accessToken: string }>('exchangeAuthCode', { code: response.code });

                        if (data && data.success && data.accessToken) {
                            setOauthToken(data.accessToken);
                            setDriveStatus('connected');
                            toast.dismiss(toastId);
                            toast.success("¡Drive Vinculado Permanentemente!");
                        } else {
                            throw new Error("Respuesta inválida del servidor");
                        }
                    } catch (e: any) {
                        toast.dismiss(toastId);
                        toast.error("Error vinculando Drive: " + e.message);
                        setDriveStatus('error');
                    }
                }
            },
        });
        client.requestCode();
    };

    const handleTokenRefresh = async (): Promise<string | null> => {
        // 🟢 AUTH GUARD (Race Condition Fix)
        if (!user) {
            console.warn("⚠️ Token Refresh Blocked: User not authenticated.");
            return null;
        }

        setDriveStatus('refreshing');
        try {
            // 🟢 BACKEND REFRESH (SILENT)
            const data = await callFunction<{ success: boolean; accessToken?: string; reason?: string }>('refreshDriveToken');

            if (data && data.success && data.accessToken) {
                console.log("✅ Token refrescado silenciosamente (Backend).");
                setOauthToken(data.accessToken);
                setDriveStatus('connected');
                return data.accessToken;
            } else {
                console.warn("⚠️ Fallo refresh silencioso:", data ? data.reason : "No Response / Network Error");
                setDriveStatus('disconnected');
                return null;
            }
        } catch (error: any) {
            if (error.code === 'functions/unauthenticated' || error.message?.includes('unauthenticated')) {
                console.warn("⚠️ Token refresh skipped (User Unauthenticated).");
            } else {
                console.error("Error refreshing token:", error);
            }
            setDriveStatus('disconnected');
            return null;
        }
    };

    // 🟢 AUTO-REFRESH TOKEN CÍCLICO
    useEffect(() => {
        if (!oauthToken) return;

        const FIFTY_MINUTES = 50 * 60 * 1000;
        console.log("⏰ Iniciando ciclo de auto-refresh (50 min)");
        const intervalId = setInterval(async () => {
            console.log("⏰ Ejecutando auto-refresh programado...");
            await handleTokenRefresh();
        }, FIFTY_MINUTES);

        return () => clearInterval(intervalId);
    }, [oauthToken]);

    // 🟢 INITIAL CHECK (ON LOAD)
    useEffect(() => {
        if (user) {
            const init = async () => {
                const token = await handleTokenRefresh();
                if (!token) {
                    // No hay refresh token guardado — marcar como desconectado, el usuario conectará manualmente
                    setDriveStatus('disconnected');
                }
            };
            init();
        }
    }, [user]);

    // 2. CONDITIONAL RETURNS (Guard Clauses)

    // 🔴 CRITICAL ERROR SCREEN (FAIL FAST)
    const isDev = import.meta.env.DEV;

    /*
       🟢 FAIL-OPEN PROTOCOL (DEMO MODE):
       Disabled blocking screen for delivery.
       Users with AdBlockers/Privacy settings will simply see a degraded security state (Red Shield)
       instead of being locked out.
    */
    /*
    if ((securityError === 'PERIMETER_BREACH' || securityError === 'SECURITY_THROTTLED') && !isDev) {
        return <SecurityLockScreen errorType={securityError} />;
    }
    */

    // 🟢 NON-BLOCKING ALERT
    useEffect(() => {
        if (securityError && !isDev) {
            console.warn("⚠️ Security Handshake Failed (Bypassed for User Access):", securityError);
            const currentLanguage = useLanguageStore.getState().currentLanguage;
            toast.error(TRANSLATIONS[currentLanguage].app.securityWarning, {
                description: "La validación de integridad falló (posible bloqueo de navegador). El sistema puede ser inestable.",
                duration: 8000,
            });
        }
    }, [securityError, isDev]);

    if (securityError && !isDev && securityError === 'MISSING_SITE_KEY') {
        const currentLanguage = useLanguageStore.getState().currentLanguage;
        const tApp = TRANSLATIONS[currentLanguage].app;
        return (
            <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center text-red-500 gap-6 p-8">
                <div className="p-4 bg-red-950/30 rounded-full border border-red-900/50">
                    <AlertTriangle className="w-12 h-12" />
                </div>
                <div className="text-center max-w-md space-y-2">
                    <h1 className="text-xl font-bold tracking-widest uppercase">{tApp.securityFailed}</h1>
                    <p className="text-sm text-zinc-400 font-mono">
                        {securityError === 'MISSING_SITE_KEY'
                            ? "Error Code: ENV_VAR_MISSING (VITE_RECAPTCHA_SITE_KEY)"
                            : "Error Code: APP_CHECK_INIT_FAILED"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-4">
                        El sistema ha bloqueado el inicio para proteger la integridad de los datos.
                        Verifica las variables de entorno.
                    </p>
                </div>
            </div>
        );
    }

    if (authLoading) return (
        <div className="h-screen w-screen bg-titanium-950 flex flex-col items-center justify-center gap-3 text-titanium-500 text-xs">
            <div className="w-7 h-7 border-2 border-titanium-800 border-t-purple-500 rounded-full animate-spin" />
            Cargando MyWorld…
        </div>
    );
    if (!user) return <LoginScreen onLoginSuccess={(u, t) => { setUser(u); setOauthToken(t); }} />;

    return (
        <ProjectConfigProvider>
            <AppContent
                user={user}
                setUser={setUser}
                setOauthToken={setOauthToken}
                oauthToken={oauthToken}
                driveStatus={driveStatus}
                setDriveStatus={setDriveStatus}
                handleTokenRefresh={handleTokenRefresh}
                handleDriveLink={handleDriveLink}
                isSecurityReady={isSecurityReady} // 👈 PASS SECURITY STATE
            />
        </ProjectConfigProvider>
    );
}

export default App;
