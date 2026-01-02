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
import ImageGenModal from './components/ImageGenModal';
import SettingsModal from './components/SettingsModal';
import FieldManualModal from './components/FieldManualModal';
import ProjectSettingsModal from './components/ProjectSettingsModal';
import DirectorPanel from './components/DirectorPanel'; // 👈 IMPORT
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
    const [activeGemId, setActiveGemId] = useState<GemId | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isDirectorOpen, setIsDirectorOpen] = useState(false); // 👈 NEW STATE
    const [activeDirectorSessionId, setActiveDirectorSessionId] = useState<string | null>(null); // 👈 NEW STATE

    // MODALES
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
    const [isImageGenOpen, setIsImageGenOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [isFieldManualOpen, setIsFieldManualOpen] = useState(false);

    // SINAPSIS
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
            const functions = getFunctions();
            const getForgeSessions = httpsCallable(functions, 'getForgeSessions');
            const createForgeSession = httpsCallable(functions, 'createForgeSession');
            const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
            const chatWithGem = httpsCallable(functions, 'chatWithGem');
            const getForgeHistory = httpsCallable(functions, 'getForgeHistory');

            try {
                let targetSessionId: string | null = null;

                // 1. TRY TO GET EXISTING SESSIONS
                try {
                    const result = await getForgeSessions({ type: 'director' });
                    const sessions = result.data as ForgeSession[];

                    if (sessions.length > 0) {
                        const mostRecent = sessions[0];
                        const lastUpdate = new Date(mostRecent.updatedAt).getTime();
                        const now = new Date().getTime();
                        const hoursDiff = (now - lastUpdate) / (1000 * 60 * 60);

                        if (hoursDiff < 24) {
                            targetSessionId = mostRecent.id;
                        }
                    }
                } catch (fetchError) {
                    console.warn("Could not fetch sessions, trying to create new one as fallback...", fetchError);
                    // Fallback will happen below since targetSessionId is still null
                }

                // 2. FALLBACK: CREATE NEW SESSION IF NEEDED
                if (!targetSessionId) {
                    try {
                        const name = `Sesión Director ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
                        const newSessionResult = await createForgeSession({ name, type: 'director' });
                        const newSession = newSessionResult.data as ForgeSession;
                        targetSessionId = newSession.id;
                    } catch (createError) {
                        console.error("Critical: Failed to create session fallback", createError);
                        toast.error("Conectando memoria... intenta en 1 minuto");
                        return; // EXIT
                    }
                }

                // 3. SET UI STATE (Open Drawer)
                setActiveDirectorSessionId(targetSessionId);
                setIsDirectorOpen(true);

                // 4. EXECUTE TURN (Save User Msg -> AI -> Save AI Msg)
                try {
                    // A. Save User Message
                    await addForgeMessage({ sessionId: targetSessionId, role: 'user', text: message });

                    // B. Get History Context
                    let historyContext: any[] = [];
                    try {
                        const historyResult = await getForgeHistory({ sessionId: targetSessionId });
                        const history = historyResult.data as any[];
                        historyContext = history.map((m: any) => ({ role: m.role, message: m.text }));
                    } catch (historyError) {
                        console.warn("Failed to load context for AI, proceeding with empty context", historyError);
                        // We continue even if history load fails, just to send the current message
                    }

                    // C. AI Generation
                    // Dynamic import for GEMS constant
                    const { GEMS } = await import('./constants');
                    const directorGem = GEMS['director'];

                    const aiResponse: any = await chatWithGem({
                        query: message,
                        history: historyContext,
                        systemInstruction: directorGem.systemInstruction
                    });

                    // D. Save AI Response
                    await addForgeMessage({ sessionId: targetSessionId, role: 'model', text: aiResponse.data.response });

                    // E. Force Refresh in Component
                    if (activeDirectorSessionId === targetSessionId) {
                        setActiveDirectorSessionId(null);
                        setTimeout(() => setActiveDirectorSessionId(targetSessionId!), 10);
                    } else {
                        setActiveDirectorSessionId(targetSessionId);
                    }

                } catch (turnError) {
                    console.error("Error executing Director turn:", turnError);
                    toast.error("El Director te escuchó, pero no pudo responder.");
                }

            } catch (e) {
                console.error("Director Command Fatal Error", e);
                toast.error("Error crítico en el sistema del Director");
            }
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

        try {
            console.log("Iniciando indexado...");
            const promise = indexTDB({ folderId, accessToken: oauthToken });

            toast.promise(promise, {
                loading: 'Indexando base de conocimiento...',
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

            <ImageGenModal
                isOpen={isImageGenOpen}
                onClose={() => setIsImageGenOpen(false)}
                accessToken={oauthToken}
            />

            {isSettingsModalOpen && (
                <SettingsModal
                    onClose={() => setIsSettingsModalOpen(false)}
                    onSave={(url) => {
                        setFolderId(url);
                    }}
                />
            )}

            {isProjectSettingsOpen && (
                <ProjectSettingsModal onClose={() => setIsProjectSettingsOpen(false)} />
            )}

            {isFieldManualOpen && (
                <FieldManualModal onClose={() => setIsFieldManualOpen(false)} />
            )}

            {!isZenMode && (
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

            <main className={`flex-1 flex flex-col min-w-0 bg-titanium-950 relative transition-all duration-300 ${isZenMode ? 'ml-0 mr-0' : 'ml-64 mr-16'}`}>
                {activeGemId === 'forja' ? (
                    <ForgePanel
                        onClose={() => setActiveGemId(null)}
                        folderId={folderId}
                        accessToken={oauthToken}
                        onOpenImageGen={() => setIsImageGenOpen(true)}
                    />
                ) : activeGemId === 'perforador' ? (
                    <ChatPanel
                        isOpen={true}
                        onClose={() => setActiveGemId(null)}
                        activeGemId={activeGemId}
                        isFullWidth={true}
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
                            onBubbleAction={handleEditorAction}
                            accessToken={oauthToken}
                            fileName={currentFileName}
                            onTokenExpired={handleTokenRefresh}
                            onFocusChange={setIsEditorFocused}
                            isZenMode={isZenMode}
                            setIsZenMode={setIsZenMode}
                        />
                        {!isChatOpen && !isEditorFocused && !isSettingsModalOpen && !isProjectSettingsOpen && !isFieldManualOpen && !isConnectModalOpen && !isImageGenOpen && !isDirectorOpen && (
                            <CommandBar onExecute={handleCommandExecution} />
                        )}
                    </>
                )}
            </main>

            {!isZenMode && (
                <ArsenalDock
                    activeGemId={activeGemId}
                    onGemSelect={handleGemSelect}
                    onOpenImageGen={() => setIsImageGenOpen(true)}
                    onToggleDirector={() => setIsDirectorOpen(prev => !prev)} // 👈 TOGGLE
                />
            )}

            <DirectorPanel
                isOpen={isDirectorOpen}
                onClose={() => setIsDirectorOpen(false)}
                activeSessionId={activeDirectorSessionId}
                onSessionSelect={setActiveDirectorSessionId}
            />

            {(activeGemId === 'guardian') && (
                <ChatPanel
                    isOpen={isChatOpen}
                    onClose={() => {
                        setIsChatOpen(false);
                        setActiveGemId(null);
                    }}
                    activeGemId={activeGemId}
                    initialMessage={pendingMessage}
                    isFullWidth={false}
                />
            )}
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

    const handleTokenRefresh = async () => {
        setDriveStatus('refreshing');
        const auth = getAuth();
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');

        try {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken;

            if (token) {
                setOauthToken(token);
                localStorage.setItem('google_drive_token', token);
                setDriveStatus('connected');
            }
        } catch (error) {
            console.error("Error refreshing token:", error);
            setDriveStatus('error');
            toast.error("Error al renovar credenciales");
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
