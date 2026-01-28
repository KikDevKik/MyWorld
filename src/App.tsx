import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFunctions, httpsCallable } from "firebase/functions";
import { initSecurity } from "./lib/firebase"; // 👈 IMPORT CENTRALIZED SECURITY
import { Toaster, toast } from 'sonner';
import VaultSidebar from './components/VaultSidebar';
import HybridEditor from './editor/HybridEditor'; // 👈 IMPORT NEW EDITOR
import { DriftMarker } from './editor/extensions/driftPlugin';
import ChatPanel from './components/ChatPanel';
import ForgePanel from './components/forge/ForgePanel';
import ArsenalDock from './components/forge/ArsenalDock';
import TribunalPanel from './components/TribunalPanel';
import LaboratoryPanel from './components/LaboratoryPanel';
import TimelinePanel from './components/TimelinePanel';
import ExportPanel from './components/ExportPanel';
import LoginScreen from './pages/LoginScreen';
import ConnectDriveModal from './components/ui/ConnectDriveModal';
import SettingsModal from './components/ui/SettingsModal';
import FieldManualModal from './components/ui/FieldManualModal';
import ProjectSettingsModal from './components/ui/ProjectSettingsModal';
import DirectorPanel from './components/DirectorPanel'; // 👈 IMPORT
import NexusCanvas from './components/NexusCanvas'; // 👈 IMPORT NEXUS (V2)
import WorldEnginePageV2 from './components/WorldEngineV2/WorldEnginePageV2'; // 👈 IMPORT WORLD ENGINE V2 (NEW)
import CanonRadar from './components/CanonRadar'; // 👈 IMPORT GUARDIAN PANEL
import SecurityLockScreen from './pages/SecurityLockScreen'; // 👈 IMPORT LOCK SCREEN
import SentinelStatus from './components/forge/SentinelStatus'; // 👈 IMPORT SENTINEL STATUS
import { useGuardian } from './hooks/useGuardian'; // 👈 IMPORT GUARDIAN HOOK
import { ProjectConfigProvider, useProjectConfig } from "./contexts/ProjectConfigContext";
import { GemId } from './types';
import { Loader2, AlertTriangle } from 'lucide-react';
import SentinelShell from './layout/SentinelShell'; // 👈 IMPORT SHELL
import { useLayoutStore } from './stores/useLayoutStore'; // 🟢 IMPORT STORE

// 🟢 NEW WRAPPER COMPONENT TO HANDLE LOADING STATE
function AppContent({ user, setUser, setOauthToken, oauthToken, driveStatus, setDriveStatus, handleTokenRefresh, isSecurityReady }: any) {
    const { config, updateConfig, refreshConfig, loading: configLoading, technicalError } = useProjectConfig();

    // 🟢 GLOBAL STORE CONSUMPTION
    const { activeView, setActiveView } = useLayoutStore();

    // APP STATE
    const [folderId, setFolderId] = useState<string>("");
    const [selectedFileContent, setSelectedFileContent] = useState<string>("");
    const [currentFileId, setCurrentFileId] = useState<string | null>(null);
    const [currentFileName, setCurrentFileName] = useState<string>('');

    // 🟢 MIGRATION NOTE: Old state 'activeGemId', 'isChatOpen', etc. removed.

    const [activeDirectorSessionId, setActiveDirectorSessionId] = useState<string | null>(null); // Kept local for session tracking
    const [directorPendingMessage, setDirectorPendingMessage] = useState<string | null>(null); // Kept local for handoff
    const [pendingMessage, setPendingMessage] = useState<string | null>(null); // Kept local for chat handoff

    // 🟢 DRIFT STATE
    const [driftAlerts, setDriftAlerts] = useState<any>(null); // 👈 STORE GROUPED ALERTS
    const [isScanningDrift, setIsScanningDrift] = useState(false);

    // 🧪 DRIFT SIMULATION (PHASE 3)
    const [driftMarkers, setDriftMarkers] = useState<DriftMarker[]>([]);

    const handleSimulateDrift = () => {
        console.log("🧪 Simulating Drift...");
        setDriftMarkers([
            { from: 0, to: 10, level: 'high' },
            { from: 50, to: 60, level: 'low' }
        ]);
        toast.info("Simulación de Drift Activada (Líneas marcadas)");
    };

    // 🟢 REAL-TIME CONTENT SYNC (DEBOUNCED FROM EDITOR)
    const handleContentChange = (newContent: string) => {
        setSelectedFileContent(newContent);
    };

    // 🟢 CALCULATE EFFECTIVE CONTEXT (FALLBACK LOGIC)
    const effectiveFileContent = selectedFileContent;
    const effectiveFileName = currentFileName;
    const isFallbackContext = false; // Always live now.

    // 🛡️ GUARDIAN HOOK (ARGOS)
    const { status: guardianStatus, conflicts: guardianConflicts, facts: guardianFacts, forceAudit } = useGuardian(effectiveFileContent, folderId);

    // 🟢 TRIGGER DRIFT SCAN WHEN DIRECTOR OPENS (ONCE PER OPEN)
    // Updated dependency to activeView
    useEffect(() => {
        if (activeView === 'director' && !driftAlerts && !isScanningDrift && folderId) {
            const scan = async () => {
                setIsScanningDrift(true);
                try {
                    console.log("📡 [SENTINEL] Triggering Deep Drift Scan...");
                    const functions = getFunctions();
                    const scanProjectDrift = httpsCallable(functions, 'scanProjectDrift');
                    const result = await scanProjectDrift({ projectId: folderId });
                    const data = result.data as any;

                    if (data.success && data.alerts) {
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
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [isFieldManualOpen, setIsFieldManualOpen] = useState(false);

    // 🟢 UI STATE
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [indexStatus, setIndexStatus] = useState<{ isIndexed: boolean; lastIndexedAt: string | null }>({ isIndexed: false, lastIndexedAt: null });

    // 🟢 INITIALIZATION & HYDRATION
    useEffect(() => {
        const initApp = async () => {
            if (!user) {
                // If no user, we are done loading (LoginScreen will show)
                setIsAppLoading(false);
                return;
            }

            if (configLoading) return; // Wait for config context to be ready

            console.log("🚀 INICIANDO HYDRATION DEL PROYECTO...");
            const functions = getFunctions();

            // 1. RESTORE TOKEN (Already done in parent)

            // 2. RESTORE PROJECT CONFIG (Folder ID)
            if (config?.folderId) {
                console.log("✅ Folder ID recuperado de Cloud Config:", config.folderId);
                setFolderId(config.folderId);
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
                    const checkIndexStatus = httpsCallable(functions, 'checkIndexStatus');
                    const result = await checkIndexStatus();
                    const status = result.data as { isIndexed: boolean, lastIndexedAt: string | null };
                    console.log("🧠 Estado de Memoria:", status);
                    setIndexStatus(status);
                }
            } catch (error) {
                console.error("Error checking index status:", error);
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
        try {
            await signOut(auth);
            setFolderId("");
            setSelectedFileContent("");
            setCurrentFileId(null);
            setOauthToken(null);
            setDriveStatus('disconnected');
        } catch (error) {
            console.error("Logout error", error);
        }
    };

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
        const functions = getFunctions();
        const indexTDB = httpsCallable(functions, 'indexTDB');

        if (!config) {
            toast.error("Configuración no cargada. Intenta de nuevo.");
            return;
        }

        const allPaths = [...(config.canonPaths || []), ...(config.resourcePaths || [])];
        const folderIds = allPaths.map(p => p.id);

        // 🟢 STRICT INDEXING: NO FALLBACK
        // If folderIds is empty, we send an empty list. The backend will interpret this as "Clear Index".
        // if (folderIds.length === 0 && config.folderId) { folderIds.push(config.folderId); } // REMOVED

        try {
            console.log("Iniciando indexado estricto...", folderIds);

            const promise = indexTDB({
                folderIds: folderIds,
                projectId: config.folderId || folderId,
                accessToken: oauthToken,
                forceFullReindex: false
            });

            toast.promise(promise, {
                loading: 'Indexando base de conocimiento (Incremental)...',
                success: (result: any) => {
                    setIndexStatus({ isIndexed: true, lastIndexedAt: new Date().toISOString() });
                    refreshConfig();
                    return `¡Aprendizaje Completado! ${result.data.message}`;
                },
                error: 'Error al indexar. Revisa la consola.',
            });

            await promise;
        } catch (error) {
            console.error(error);
        }
    };

    const handleIndex = () => {
        const displayDate = config?.lastIndexed || indexStatus.lastIndexedAt;

        if (indexStatus.isIndexed) {
             toast("Memoria ya sincronizada", {
                description: `Última actualización: ${displayDate ? new Date(displayDate).toLocaleDateString() : 'Desconocida'}`,
                action: {
                    label: "Re-aprender todo",
                    onClick: () => executeIndexing()
                },
            });
            return;
        }

        if (!folderId) {
            toast.warning("¡Conecta una carpeta primero!");
            return;
        }

        toast("¿Iniciar Protocolo de Aprendizaje?", {
            description: "Esto leerá tu Drive y actualizará la memoria de la IA.",
            action: {
                label: "Confirmar",
                onClick: () => executeIndexing()
            },
        });
    };

    // 🟢 HANDLE TIMELINE FILE SELECT
    const handleTimelineFileSelect = async (fileId: string) => {
        setActiveView('editor'); // Go back to editor to show content
        setSelectedFileContent("Cargando...");
        setCurrentFileId(fileId);

        const functions = getFunctions();
        const getDriveFileContent = httpsCallable(functions, 'getDriveFileContent');

        try {
            const result = await getDriveFileContent({ fileId, accessToken: oauthToken });
            const data = result.data as { content: string; name: string };
            setSelectedFileContent(data.content);
            setCurrentFileName(data.name);
        } catch (error) {
            console.error("Error loading file from timeline:", error);
            toast.error("Error al abrir el archivo.");
            setSelectedFileContent("");
        }
    };

    // 🟢 LOADING GATE
    if (isAppLoading) {
        return (
            <div className="h-screen w-screen bg-titanium-950 flex flex-col items-center justify-center text-titanium-200 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
                <p className="text-sm font-mono tracking-widest opacity-70">CARGANDO SISTEMAS NEURONALES...</p>
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
                onToggleDirector={() => setActiveView('director')}
                onSimulateDrift={handleSimulateDrift}
                isSecurityReady={isSecurityReady}
                onToggleSentinel={() => setActiveView(activeView === 'sentinel' ? 'editor' : 'sentinel')}
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
                />
            );
        } else if (activeView === 'director') {
            expandedContent = (
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
                />
            );
        } else if (activeView === 'tribunal') {
            expandedContent = (
                <TribunalPanel
                    onClose={() => setActiveView('editor')}
                    initialText={selectedFileContent}
                    currentFileId={currentFileId}
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
    const renderZoneBContent = () => {
        if (activeView === 'forja') {
            return (
                <ForgePanel
                    onClose={() => setActiveView('editor')}
                    folderId={folderId}
                    accessToken={oauthToken}
                />
            );
        }
        if (activeView === 'guardian') {
            return (
                <CanonRadar
                    status={guardianStatus}
                    facts={guardianFacts}
                    conflicts={guardianConflicts}
                    onClose={() => setActiveView('editor')}
                    onForceAudit={forceAudit}
                    accessToken={oauthToken}
                />
            );
        }
        if (activeView === 'perforador') {
            return (
                <WorldEnginePageV2
                    isOpen={true}
                    onClose={() => setActiveView('editor')}
                    activeGemId={'perforador'}
                    accessToken={oauthToken}
                    onRefreshTokens={handleTokenRefresh}
                />
            );
        }
        if (activeView === 'laboratorio') {
            return (
                <LaboratoryPanel
                    onClose={() => setActiveView('editor')}
                    folderId={folderId}
                    accessToken={oauthToken}
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

        // Default: Editor
        return (
            <>
                <HybridEditor
                    content={selectedFileContent}
                    onContentChange={handleContentChange}
                    driftMarkers={driftMarkers}
                    className="h-full"
                />
            </>
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
                />
            )}

            {isProjectSettingsOpen && (
                <ProjectSettingsModal onClose={() => setIsProjectSettingsOpen(false)} />
            )}

            {isFieldManualOpen && (
                <FieldManualModal onClose={() => setIsFieldManualOpen(false)} />
            )}

            <SentinelShell
                isZenMode={isZenMode}
                // Props removed in SentinelShell refactor are implicitly handled via store
                sidebar={
                    <VaultSidebar
                        folderId={folderId}
                        onFolderIdChange={setFolderId}
                        onFileSelect={(id, content, name) => {
                            setCurrentFileId(id);
                            setSelectedFileContent(content);
                            setCurrentFileName(name || 'Documento');
                        }}
                        onOpenConnectModal={() => setIsConnectModalOpen(true)}
                        onLogout={handleLogout}
                        onIndexRequest={handleIndex}
                        onOpenSettings={() => setIsSettingsModalOpen(true)}
                        onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
                        accessToken={oauthToken}
                        onRefreshTokens={handleTokenRefresh}
                        driveStatus={driveStatus}
                        onOpenManual={() => setIsFieldManualOpen(true)}
                        isIndexed={indexStatus.isIndexed}
                        isSecurityReady={isSecurityReady}
                        activeFileId={currentFileId}
                    />
                }
                editor={renderZoneBContent()}
                tools={renderZoneCContent()}
            />
        </>
    );
}

function App() {
    console.log("🚀 App Mounting...");
    console.log("👻 JULES MODE:", import.meta.env.VITE_JULES_MODE);
    console.log("🛠️ DEV MODE:", import.meta.env.DEV);

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
                delete: async () => {},
                getIdToken: async () => 'mock-token',
                getIdTokenResult: async () => ({} as any),
                reload: async () => {},
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

            // 🟢 INTENTO DE RECUPERAR TOKEN GUARDADO
            const storedToken = localStorage.getItem('google_drive_token');
            if (storedToken) {
                setOauthToken(storedToken);
                setDriveStatus('connected');
            } else {
                setDriveStatus('disconnected');
            }
        });
        return () => unsubscribe();
    }, []);

    const handleTokenRefresh = async (): Promise<string | null> => {
        setDriveStatus('refreshing');
        const auth = getAuth();
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        provider.addScope('https://www.googleapis.com/auth/drive.readonly');

        try {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken || null;

            if (token) {
                setOauthToken(token);
                localStorage.setItem('google_drive_token', token);
                setDriveStatus('connected');
            }
            return token;
        } catch (error) {
            console.error("Error refreshing token:", error);
            setDriveStatus('error');
            toast.error("Error al renovar credenciales");
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

    // 2. CONDITIONAL RETURNS (Guard Clauses)

    // 🔴 CRITICAL ERROR SCREEN (FAIL FAST)
    const isDev = import.meta.env.DEV;

    if (securityError === 'PERIMETER_BREACH' && !isDev) {
        return <SecurityLockScreen />;
    }

    if (securityError && !isDev) {
        return (
            <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center text-red-500 gap-6 p-8">
                <div className="p-4 bg-red-950/30 rounded-full border border-red-900/50">
                     <AlertTriangle className="w-12 h-12" />
                </div>
                <div className="text-center max-w-md space-y-2">
                    <h1 className="text-xl font-bold tracking-widest uppercase">Protocolo de Seguridad Fallido</h1>
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

    if (authLoading) return <div className="h-screen w-screen bg-titanium-950" />;
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
                isSecurityReady={isSecurityReady} // 👈 PASS SECURITY STATE
            />
        </ProjectConfigProvider>
    );
}

export default App;
