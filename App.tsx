import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFunctions, httpsCallable } from "firebase/functions";
import { Toaster, toast } from 'sonner';
import VaultSidebar from './components/VaultSidebar';
import Editor from './components/Editor';
import ChatPanel from './components/ChatPanel';
import ForgePanel from './components/ForgePanel';
import ArsenalDock from './components/ArsenalDock';
import TribunalPanel from './components/TribunalPanel';
import LaboratoryPanel from './components/LaboratoryPanel';
import TimelinePanel from './components/TimelinePanel';
import ExportPanel from './components/ExportPanel';
import CommandBar from './components/CommandBar';
import LoginScreen from './components/LoginScreen';
import ConnectDriveModal from './components/ConnectDriveModal';
import SettingsModal from './components/SettingsModal';
import FieldManualModal from './components/FieldManualModal';
import ProjectSettingsModal from './components/ProjectSettingsModal';
import DirectorPanel from './components/DirectorPanel'; // 👈 IMPORT
import WorldEnginePanel from './components/WorldEnginePanel'; // 👈 IMPORT NEW PANEL
import CanonRadar from './components/CanonRadar'; // 👈 IMPORT GUARDIAN PANEL
import { useGuardian } from './hooks/useGuardian'; // 👈 IMPORT GUARDIAN HOOK
import { ProjectConfigProvider, useProjectConfig } from './components/ProjectConfigContext';
import { GemId, ProjectConfig, ForgeSession } from './types';
import { Loader2 } from 'lucide-react';

// 🟢 NEW WRAPPER COMPONENT TO HANDLE LOADING STATE
// We need this because we want to use 'useProjectConfig' which requires ProjectConfigProvider
function AppContent({ user, setUser, setOauthToken, oauthToken, driveStatus, setDriveStatus, handleTokenRefresh }: any) {
    const { config, updateConfig, refreshConfig, loading: configLoading } = useProjectConfig();

    // APP STATE
    const [folderId, setFolderId] = useState<string>("");
    const [selectedFileContent, setSelectedFileContent] = useState<string>("");
    const [currentFileId, setCurrentFileId] = useState<string | null>(null);
    const [currentFileName, setCurrentFileName] = useState<string>('');

    // 🟢 COLD START FALLBACK STATE
    const [lastActiveFileContent, setLastActiveFileContent] = useState<string>("");
    const [lastActiveFileId, setLastActiveFileId] = useState<string | null>(null);
    const [lastActiveFileName, setLastActiveFileName] = useState<string>("");

    const [activeGemId, setActiveGemId] = useState<GemId | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isDirectorOpen, setIsDirectorOpen] = useState(false); // 👈 NEW STATE
    const [activeDirectorSessionId, setActiveDirectorSessionId] = useState<string | null>(null); // 👈 NEW STATE
    const [directorPendingMessage, setDirectorPendingMessage] = useState<string | null>(null); // 👈 DIRECTOR HANDOFF

    // 🟢 REAL-TIME CONTENT SYNC (DEBOUNCED FROM EDITOR)
    const handleContentChange = (newContent: string) => {
        setSelectedFileContent(newContent);
    };

    // 🟢 CALCULATE EFFECTIVE CONTEXT (FALLBACK LOGIC)
    const effectiveFileContent = selectedFileContent || lastActiveFileContent;
    const effectiveFileName = currentFileName || lastActiveFileName;
    const isFallbackContext = !selectedFileContent && !!lastActiveFileContent;

    // 🛡️ GUARDIAN HOOK (ARGOS)
    const { status: guardianStatus, conflicts: guardianConflicts, facts: guardianFacts, forceAudit } = useGuardian(effectiveFileContent, folderId);

    // 🟢 PERSIST LAST ACTIVE CONTEXT
    useEffect(() => {
        if (currentFileId && selectedFileContent && currentFileName) {
            setLastActiveFileContent(selectedFileContent);
            setLastActiveFileId(currentFileId);
            setLastActiveFileName(currentFileName);

            localStorage.setItem('lastActiveFileContent', selectedFileContent);
            localStorage.setItem('lastActiveFileId', currentFileId);
            localStorage.setItem('lastActiveFileName', currentFileName);
        }
    }, [currentFileId, selectedFileContent, currentFileName]);

    // MODALES
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [isFieldManualOpen, setIsFieldManualOpen] = useState(false);

    // SINAPSIS (Guardian)
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);

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

            // Restore Last Active Context
            const storedContent = localStorage.getItem('lastActiveFileContent');
            const storedId = localStorage.getItem('lastActiveFileId');
            const storedName = localStorage.getItem('lastActiveFileName');
            if (storedContent) setLastActiveFileContent(storedContent);
            if (storedId) setLastActiveFileId(storedId);
            if (storedName) setLastActiveFileName(storedName);

            console.log("🚀 INICIANDO HYDRATION DEL PROYECTO...");
            const functions = getFunctions();

            // 1. RESTORE TOKEN (Already done in parent, passed as prop, but double check)
            // (Handled by parent App component)

            // 2. RESTORE PROJECT CONFIG (Folder ID)
            let currentFolderId = "";

            if (config?.folderId) {
                console.log("✅ Folder ID recuperado de Cloud Config:", config.folderId);
                currentFolderId = config.folderId;
                setFolderId(config.folderId);
            } else {
                // FALLBACK: LocalStorage (Migration path)
                const storedFolderId = localStorage.getItem('myworld_folder_id');
                if (storedFolderId) {
                    console.log("⚠️ Migrando Folder ID de LocalStorage a Cloud Config...");
                    currentFolderId = storedFolderId;
                    setFolderId(storedFolderId);
                    // Sync to cloud silently
                    updateConfig({ ...config!, folderId: storedFolderId }).catch(console.error);
                }
            }

            // 3. CHECK INDEX STATUS
            try {
                const checkIndexStatus = httpsCallable(functions, 'checkIndexStatus');
                const result = await checkIndexStatus();
                const status = result.data as { isIndexed: boolean, lastIndexedAt: string | null };
                console.log("🧠 Estado de Memoria:", status);
                setIndexStatus(status);
            } catch (error) {
                console.error("Error checking index status:", error);
            }

            // 4. DONE
            setIsAppLoading(false);
        };

        initApp();
    }, [user, config, configLoading]);


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
        if (activeGemId === id && isChatOpen) {
            setIsChatOpen(false);
            setTimeout(() => setActiveGemId(null), 300);
        } else {
            setActiveGemId(id);
            setIsChatOpen(true);
        }
    };

    const handleCommandExecution = async (message: string, tool: GemId) => {
        if (tool === 'director') {
            // 🟢 HANDOFF TO DIRECTOR PANEL
            setDirectorPendingMessage(message);
            setIsDirectorOpen(true);
            return;
        }

        setActiveGemId(tool);
        setPendingMessage(message);
        setIsChatOpen(true);
    };

    // 🧠 LÓGICA DE INDEXADO (BOTÓN ROJO)
    const executeIndexing = async () => {
        const functions = getFunctions();
        const indexTDB = httpsCallable(functions, 'indexTDB');

        // 🟢 FIX: USE PROJECT CONFIG FOR ROBUST INDEXING
        if (!config) {
            toast.error("Configuración no cargada. Intenta de nuevo.");
            return;
        }

        const allPaths = [...(config.canonPaths || []), ...(config.resourcePaths || [])];
        const folderIds = allPaths.map(p => p.id);

        // If no specific paths, fallback to root folderId
        if (folderIds.length === 0 && config.folderId) {
            folderIds.push(config.folderId);
        }

        try {
            console.log("Iniciando indexado incremental...", folderIds);

            // 🟢 PAYLOAD ROBUSTO: folderIds + projectId + forceFullReindex: false
            const promise = indexTDB({
                folderIds: folderIds,
                projectId: config.folderId || folderId, // Context Project ID
                accessToken: oauthToken,
                forceFullReindex: false
            });

            toast.promise(promise, {
                loading: 'Indexando base de conocimiento (Incremental)...',
                success: (result: any) => {
                    // 🟢 UPDATE LOCAL STATE & REFRESH GLOBAL CONFIG
                    setIndexStatus({ isIndexed: true, lastIndexedAt: new Date().toISOString() });
                    // Force refresh config to get the definitive timestamp from backend
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
        // 🟢 DATE LOGIC: Prioritize Config > IndexStatus
        const displayDate = config?.lastIndexed || indexStatus.lastIndexedAt;

        // Si ya está indexado, solo informamos (o permitimos re-indexar forzadamente)
        if (indexStatus.isIndexed) {
             toast("Memoria ya sincronizada", {
                description: `Última actualización: ${displayDate ? new Date(displayDate).toLocaleDateString() : 'Desconocida'}`,
                action: {
                    label: "Re-aprender todo",
                    onClick: () => executeIndexing() // Allow force re-index
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

    // BUBBLE MENU ACTIONS
    const handleEditorAction = (action: string, text: string) => {
        let prompt = "";
        switch (action) {
            case 'mejorar': prompt = `Actúa como editor literario. Mejora el estilo y la prosa del siguiente fragmento: \n\n"${text}"`; break;
            case 'expandir': prompt = `Actúa como co-escritor. Expande este fragmento añadiendo detalles sensoriales: \n\n"${text}"`; break;
            case 'corregir': prompt = `Actúa como corrector. Revisa gramática y ortografía: \n\n"${text}"`; break;
        }
        handleCommandExecution(prompt, 'director');
    };

    // 🟢 HANDLE TIMELINE FILE SELECT
    const handleTimelineFileSelect = async (fileId: string) => {
        setActiveGemId(null);
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

    // 🟢 CALCULATE EFFECTIVE CONTEXT (FALLBACK LOGIC)
    // (Moved up for Hook Usage)

    return (
        <div className="flex h-screen w-screen bg-titanium-900 text-titanium-200 font-sans overflow-hidden">
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
                    localStorage.setItem('myworld_folder_id', id);
                    // 🟢 SYNC TO CLOUD CONFIG
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

            {!isZenMode && activeGemId !== 'perforador' && activeGemId !== 'forja' && (
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
                    isIndexed={indexStatus.isIndexed} // 👈 Pass index status
                />
            )}

            <main className={`flex-1 flex flex-col min-w-0 bg-titanium-950 relative transition-all duration-300 ${isZenMode ? 'ml-0 mr-0' : (activeGemId === 'perforador' || activeGemId === 'forja') ? 'ml-0 mr-16' : 'ml-64 mr-16'}`}>
                {activeGemId === 'forja' ? (
                    <ForgePanel
                        onClose={() => setActiveGemId(null)}
                        folderId={folderId}
                        accessToken={oauthToken}
                    />
                ) : activeGemId === 'perforador' ? (
                    <WorldEnginePanel
                        isOpen={true}
                        onClose={() => setActiveGemId(null)}
                        activeGemId={activeGemId}
                    />
                ) : activeGemId === 'tribunal' ? (
                    <TribunalPanel
                        onClose={() => setActiveGemId(null)}
                        initialText={selectedFileContent}
                        currentFileId={currentFileId}
                        accessToken={oauthToken}
                    />
                ) : activeGemId === 'laboratorio' ? (
                    <LaboratoryPanel
                        onClose={() => setActiveGemId(null)}
                        folderId={folderId}
                        accessToken={oauthToken}
                    />
                ) : activeGemId === 'cronograma' ? (
                    <TimelinePanel
                        onClose={() => setActiveGemId(null)}
                        userId={user?.uid || null}
                        onFileSelect={handleTimelineFileSelect}
                        currentFileId={currentFileId}
                        accessToken={oauthToken}
                    />
                ) : activeGemId === 'imprenta' ? (
                    <ExportPanel
                        onClose={() => setActiveGemId(null)}
                        folderId={folderId}
                        accessToken={oauthToken}
                    />
                ) : (
                    <>
                        <Editor
                            fileId={currentFileId}
                            content={selectedFileContent}
                            onContentChange={handleContentChange} // 👈 SYNC STATE
                            onBubbleAction={handleEditorAction}
                            accessToken={oauthToken}
                            fileName={currentFileName}
                            onTokenExpired={handleTokenRefresh}
                            onFocusChange={setIsEditorFocused}
                            isZenMode={isZenMode}
                            setIsZenMode={setIsZenMode}
                        />
                        {!isChatOpen && !isEditorFocused && !isSettingsModalOpen && !isProjectSettingsOpen && !isFieldManualOpen && !isConnectModalOpen && !isDirectorOpen && (
                            <CommandBar onExecute={handleCommandExecution} />
                        )}
                    </>
                )}
            </main>

            {!isZenMode && (
                <ArsenalDock
                    activeGemId={activeGemId}
                    onGemSelect={handleGemSelect}
                    onToggleDirector={() => setIsDirectorOpen(prev => !prev)} // 👈 TOGGLE
                />
            )}

            <DirectorPanel
                isOpen={isDirectorOpen}
                onClose={() => setIsDirectorOpen(false)}
                activeSessionId={activeDirectorSessionId}
                onSessionSelect={setActiveDirectorSessionId}
                pendingMessage={directorPendingMessage}
                onClearPendingMessage={() => setDirectorPendingMessage(null)}
                activeFileContent={effectiveFileContent} // 👈 Pass Effective Context
                activeFileName={effectiveFileName}     // 👈 Pass Effective Name
                isFallbackContext={isFallbackContext}  // 👈 Pass Flag
                folderId={folderId} // 👈 PASS PROJECT ID
            />

            {/* 🛡️ GUARDIAN (CANON RADAR) */}
            {activeGemId === 'guardian' ? (
                <div className={`
                    fixed inset-y-0 right-16 z-40 transform transition-transform duration-300 ease-in-out
                    ${activeGemId === 'guardian' ? 'translate-x-0' : 'translate-x-full'}
                `}>
                    <CanonRadar
                        status={guardianStatus}
                        facts={guardianFacts}
                        conflicts={guardianConflicts}
                        onClose={() => setActiveGemId(null)}
                        onForceAudit={forceAudit}
                        accessToken={oauthToken}
                    />
                </div>
            ) : (activeGemId && activeGemId !== 'director' && activeGemId !== 'perforador' && activeGemId !== 'forja' && activeGemId !== 'tribunal' && activeGemId !== 'laboratorio' && activeGemId !== 'cronograma' && activeGemId !== 'imprenta') ? (
                <ChatPanel
                    isOpen={isChatOpen}
                    onClose={() => {
                        setIsChatOpen(false);
                        setActiveGemId(null);
                    }}
                    activeGemId={activeGemId}
                    initialMessage={pendingMessage}
                    isFullWidth={false}
                    folderId={folderId} // 👈 PASS PROJECT ID
                    activeFileContent={effectiveFileContent} // 👈 Pass Context
                    activeFileName={effectiveFileName}     // 👈 Pass Context
                    isFallbackContext={isFallbackContext}  // 👈 Pass Flag
                />
            ) : null}
        </div>
    );
}

function App() {
    // AUTH LIFTED STATE
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [oauthToken, setOauthToken] = useState<string | null>(null);
    const [driveStatus, setDriveStatus] = useState<'connected' | 'refreshing' | 'error' | 'disconnected'>('disconnected');

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
            setAuthLoading(false);
            setDriveStatus('disconnected');
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
            />
        </ProjectConfigProvider>
    );
}

export default App;
