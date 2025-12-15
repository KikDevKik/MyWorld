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
import FieldManualModal from './components/FieldManualModal'; // 👈 Import
import ProjectSettingsModal from './components/ProjectSettingsModal'; // 👈 Import
import { ProjectConfigProvider } from './components/ProjectConfigContext'; // 👈 Import
import { GemId } from './types';

function App() {
    // AUTH
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    // APP STATE
    const [folderId, setFolderId] = useState<string>("");
    const [selectedFileContent, setSelectedFileContent] = useState<string>("");
    const [currentFileId, setCurrentFileId] = useState<string | null>(null);
    const [currentFileName, setCurrentFileName] = useState<string>('');
    const [activeGemId, setActiveGemId] = useState<GemId | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [oauthToken, setOauthToken] = useState<string | null>(null);
    const [driveStatus, setDriveStatus] = useState<'connected' | 'refreshing' | 'error' | 'disconnected'>('disconnected');

    // MODALES
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
    const [isImageGenOpen, setIsImageGenOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false); // 👈 New state
    const [isFieldManualOpen, setIsFieldManualOpen] = useState(false); // 👈 New state

    // SINAPSIS
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);

    // 🟢 UI STATE
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);

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
                setDriveStatus('connected'); // Assume connected if token exists
            } else {
                setDriveStatus('disconnected');
            }

            // 🟢 RECUPERAR FOLDER ID GUARDADO
            const storedFolderId = localStorage.getItem('myworld_folder_id');
            if (storedFolderId) {
                setFolderId(storedFolderId);
            }
        });
        return () => unsubscribe();
    }, []);

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
                // ✅ Actualizar INMEDIATAMENTE estado y localStorage
                setOauthToken(token);
                localStorage.setItem('google_drive_token', token);
                setDriveStatus('connected');
                // toast.success("Credenciales renovadas"); // 👈 Removed intrusive toast
            }
        } catch (error) {
            console.error("Error refreshing token:", error);
            setDriveStatus('error');
            toast.error("Error al renovar credenciales");
        }
    };

    // 🟢 AUTO-REFRESH TOKEN CÍCLICO (setInterval)
    useEffect(() => {
        if (!oauthToken) return;

        const FIFTY_MINUTES = 50 * 60 * 1000; // 3000000 ms

        console.log("⏰ Iniciando ciclo de auto-refresh (50 min)");
        const intervalId = setInterval(() => {
            console.log("⏰ Ejecutando auto-refresh programado...");
            handleTokenRefresh();
        }, FIFTY_MINUTES);

        return () => {
            console.log("⏰ Limpiando ciclo de auto-refresh");
            clearInterval(intervalId);
        };
    }, [oauthToken]);

    const handleGemSelect = (id: GemId) => {
        // ✅ Si es la misma gema activa, cerrar
        if (activeGemId === id && isChatOpen) {
            setIsChatOpen(false);
            setTimeout(() => setActiveGemId(null), 300);
        } else {
            // ✅ Si es diferente o no está abierto, cambiar directamente
            setActiveGemId(id);
            setIsChatOpen(true);
        }
    };

    const handleCommandExecution = (message: string, tool: GemId) => {
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
                success: (result: any) => `¡Aprendizaje Completado! ${result.data.message}`,
                error: 'Error al indexar. Revisa la consola.',
            });

            await promise;
        } catch (error) {
            console.error(error);
        }
    };

    const handleIndex = () => {
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
        // 1. Close panel to show editor
        setActiveGemId(null);

        // 2. Set loading state
        setSelectedFileContent("Cargando...");
        setCurrentFileId(fileId);

        // 3. Fetch content
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
            setSelectedFileContent(""); // Reset on error
        }
    };

    if (authLoading) return <div className="h-screen w-screen bg-titanium-950" />;
    if (!user) return <LoginScreen onLoginSuccess={(u, t) => { setUser(u); setOauthToken(t); }} />;

    return (
      <ProjectConfigProvider>
        <div className="flex h-screen w-screen bg-titanium-900 text-titanium-200 font-sans overflow-hidden">

            {/* 🟢 GLOBAL TOASTER */}
            <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: '#09090b', // bg-titanium-950
                        border: '1px solid #27272a', // border-titanium-700
                        color: '#e4e4e7', // text-titanium-200
                    },
                    className: 'z-50',
                }}
            />

            {/* MODALES GLOBLALES */}
            <ConnectDriveModal
                isOpen={isConnectModalOpen}
                onClose={() => setIsConnectModalOpen(false)}
                onSubmit={(id) => {
                    setFolderId(id);
                    // ✅ Guardar folder ID en localStorage
                    localStorage.setItem('myworld_folder_id', id);
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
                        // SettingsModal handles profile saving internally
                    }}
                />
            )}

            {isProjectSettingsOpen && (
                <ProjectSettingsModal onClose={() => setIsProjectSettingsOpen(false)} />
            )}

            {/* FIELD MANUAL MODAL */}
            {isFieldManualOpen && (
                <FieldManualModal onClose={() => setIsFieldManualOpen(false)} />
            )}

            {/* SIDEBAR (IZQUIERDA) - Oculto en Zen Mode */}
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
                    onOpenManual={() => setIsFieldManualOpen(true)} // 👈 Connect prop
                />
            )}

            {/* ÁREA PRINCIPAL (CENTRO) */}
            <main className={`flex-1 flex flex-col min-w-0 bg-titanium-950 relative transition-all duration-300 ${isZenMode ? 'ml-0 mr-0' : 'ml-64 mr-16'}`}>

                {/* 🟢 MAIN STAGE LOGIC */}
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
                        isFullWidth={true} // 👈 Full width for Worldbuilder
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
                        {/* COMMAND BAR (Only visible when Editor is NOT active/focused) */}
                        {!isChatOpen && !isEditorFocused && !isSettingsModalOpen && !isProjectSettingsOpen && !isFieldManualOpen && !isConnectModalOpen && !isImageGenOpen && (
                            <CommandBar onExecute={handleCommandExecution} />
                        )}
                    </>
                )}
            </main>

            {/* DOCK DE HERRAMIENTAS (DERECHA) - Oculto en Zen Mode */}
            {!isZenMode && (
                <ArsenalDock
                    activeGemId={activeGemId}
                    onGemSelect={handleGemSelect}
                    onOpenImageGen={() => setIsImageGenOpen(true)}
                />
            )}

            {/* CHAT PANEL (SIDE - Only for Director/Guardian) */}
            {(activeGemId === 'director' || activeGemId === 'guardian') && (
                <ChatPanel
                    isOpen={isChatOpen}
                    onClose={() => {
                        setIsChatOpen(false);
                        setActiveGemId(null);
                    }}
                    activeGemId={activeGemId}
                    initialMessage={pendingMessage}
                    isFullWidth={false} // 👈 Fixed side panel for assistants
                />
            )}

        </div>
      </ProjectConfigProvider>
    );
}

export default App;
