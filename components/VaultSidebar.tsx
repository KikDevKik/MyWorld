import React, { useState, useEffect } from 'react';
import { Settings, LogOut, HelpCircle, HardDrive, BrainCircuit, ChevronDown, Key, FolderCog, AlertTriangle } from 'lucide-react';
import FileTree from './FileTree';
import { useProjectConfig } from './ProjectConfigContext';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";

interface VaultSidebarProps {
    folderId: string;
    onFolderIdChange: (id: string) => void;
    onFileSelect: (id: string, content: string, name?: string) => void;
    onOpenConnectModal: () => void;
    onLogout: () => void;
    onIndexRequest: () => void;
    onOpenSettings: () => void;
    onOpenProjectSettings: () => void; // 👈 New prop for Project Settings Modal
    accessToken: string | null;
    onRefreshTokens: () => void;
    driveStatus: 'connected' | 'refreshing' | 'error' | 'disconnected';
    onOpenManual: () => void; // 👈 New prop
    isIndexed?: boolean; // 👈 New prop for Index State
    isSecurityReady?: boolean; // 👈 New prop for Circuit Breaker
}

// Interfaz para los archivos que vienen del FileTree
interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
}

const VaultSidebar: React.FC<VaultSidebarProps> = ({
    folderId,
    onFolderIdChange,
    onFileSelect,
    onOpenConnectModal,
    onLogout,
    onIndexRequest,
    onOpenSettings,
    onOpenProjectSettings,
    accessToken,
    onRefreshTokens,
    driveStatus,
    onOpenManual, // 👈 Destructure
    isIndexed = false, // 👈 Default to false
    isSecurityReady = false, // 👈 Default false for safety
}) => {
    // STATE
    const [topLevelFolders, setTopLevelFolders] = useState<FileNode[]>([]);
    const [selectedSagaId, setSelectedSagaId] = useState<string | null>(null);
    const { config } = useProjectConfig();

    // 🟢 INDEXED TREE STATE
    const [indexedTree, setIndexedTree] = useState<FileNode[] | null>(null);
    const [isLoadingTree, setIsLoadingTree] = useState(true);

    // 🟢 FIRESTORE LISTENER
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            setIndexedTree(null);
            setIsLoadingTree(false);
            return;
        }

        // 🟢 CIRCUIT BREAKER: Block Listener until Security Handshake is Valid
        if (!isSecurityReady) {
             console.log("🛡️ [CIRCUIT BREAKER] VaultSidebar waiting for App Check...");
             // We keep loading state true to show skeleton
             setIsLoadingTree(true);
             return;
        }

        const db = getFirestore();
        const docRef = doc(db, "TDB_Index", user.uid, "structure", "tree");

        console.log("📡 Suscribiéndose a TDB_Index/structure/tree...");

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && data.tree && Array.isArray(data.tree)) {
                     console.log("🌳 Árbol indexado actualizado:", data.tree.length, "nodos raíz");
                     setIndexedTree(data.tree);
                     // Update top level folders for dropdown
                     const folders = data.tree.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder');
                     setTopLevelFolders(folders);
                } else {
                     setIndexedTree([]);
                }
            } else {
                console.log("⚠️ No se encontró estructura de árbol (¿Nuclear Re-index requerido?)");
                setIndexedTree([]);
            }
            setIsLoadingTree(false);
        }, (error) => {
            console.error("Error escuchando árbol indexado:", error);
            setIndexedTree([]);
            setIsLoadingTree(false);
        });

        return () => unsubscribe();
    }, [isSecurityReady]); // 👈 Dependencia crítica para re-ejecutar tras handshake


    // 🟢 STATUS INDICATOR HELPER
    const getStatusConfig = () => {
        switch (driveStatus) {
            case 'connected':
                return { color: 'text-green-500', text: 'Conexión Estable', icon: Key };
            case 'refreshing':
                return { color: 'text-yellow-500 animate-pulse', text: 'Refrescando...', icon: Key };
            case 'error':
                return { color: 'text-red-500', text: 'Error de Conexión', icon: HelpCircle };
            default:
                return { color: 'text-titanium-600', text: 'Desconectado', icon: Key };
        }
    };

    const status = getStatusConfig();

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-titanium-800 border-r border-titanium-700/50 flex flex-col z-20 select-none">

            {/* HEADER / SAGA SELECTOR */}
            <div className="px-4 py-4 border-b border-titanium-700/30">
                <div className="flex items-center gap-2 mb-3">
                    <div className="text-titanium-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-xs font-medium text-titanium-400 uppercase tracking-wider">Manual de Campo</h2>
                    {/* BOTÓN DE INDEXAR */}
                    <button
                        onClick={onIndexRequest}
                        className={`ml-auto p-1.5 rounded-md hover:bg-titanium-700 transition-colors shrink-0 ${isIndexed ? 'text-green-500 hover:text-green-400' : 'text-titanium-400 hover:text-accent-DEFAULT'}`}
                        title={isIndexed ? "Memoria Sincronizada (Click para forzar)" : "Indexar Conocimiento (TDB)"}
                    >
                        <BrainCircuit size={16} />
                    </button>
                </div>
                <div className="relative">
                    <select
                        value={selectedSagaId || ''}
                        onChange={(e) => setSelectedSagaId(e.target.value || null)}
                        className="w-full appearance-none bg-titanium-950 hover:bg-titanium-900 text-sm font-medium text-titanium-100 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 cursor-pointer py-2 px-3 pr-8 rounded-md border border-titanium-700 transition-all"
                        disabled={!indexedTree || indexedTree.length === 0}
                    >
                        <option value="" className="bg-titanium-950 text-titanium-100">Vista Global</option>
                        {topLevelFolders.map(folder => (
                            <option key={folder.id} value={folder.id} className="bg-titanium-950 text-titanium-100">
                                {folder.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-titanium-400 pointer-events-none transition-colors"
                    />
                </div>
            </div>

            {/* FILE TREE */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                {isLoadingTree ? (
                    // 🟢 TITANIUM SKELETON (CIRCUIT BREAKER VISUAL)
                    <div className="flex flex-col gap-3 p-2 animate-pulse">
                        <div className="h-4 bg-titanium-700/50 rounded w-3/4"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-1/2 ml-4"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-2/3 ml-4"></div>
                        <div className="h-4 bg-titanium-700/50 rounded w-5/6"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-1/3 ml-4"></div>
                    </div>
                ) : (
                    <>
                         {indexedTree && indexedTree.length > 0 ? (
                            <FileTree
                                folderId={folderId} // ⚠️ Ignored if preloadedTree is passed
                                onFileSelect={onFileSelect}
                                accessToken={accessToken}
                                rootFilterId={selectedSagaId}
                                // onLoad is handled by parent subscription now
                                preloadedTree={indexedTree} // 👈 PASS THE INDEXED TREE
                            />
                         ) : (
                             <div className="flex flex-col items-center justify-center p-6 text-center gap-3 mt-10">
                                 <div className="p-3 bg-titanium-700/30 rounded-full">
                                     <AlertTriangle className="text-yellow-500" size={24} />
                                 </div>
                                 <h3 className="text-sm font-bold text-titanium-200">Memoria Vacía</h3>
                                 <p className="text-xs text-titanium-400 leading-relaxed">
                                     La IA no tiene archivos indexados.
                                     Ve a <strong>Preferencias &gt; Memoria</strong> y ejecuta un <span className="text-red-400 font-bold">Nuclear Re-index</span> para construir el mapa.
                                 </p>
                                 <button
                                     onClick={onIndexRequest}
                                     className="mt-2 text-xs bg-titanium-700 hover:bg-titanium-600 text-white px-4 py-2 rounded-lg transition-colors"
                                 >
                                     Ir a Indexar
                                 </button>
                             </div>
                         )}
                    </>
                )}
            </div>

            {/* FOOTER */}
            <div className="p-3 border-t border-titanium-700/30 bg-titanium-800">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={onOpenManual}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-titanium-700/50 transition-all text-xs font-medium group"
                    >
                        <HelpCircle size={16} className="group-hover:text-accent-DEFAULT transition-colors" />
                        <span>Manual de Campo</span>
                    </button>

                    <button
                        onClick={onOpenProjectSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-titanium-700/50 transition-all text-xs font-medium group"
                    >
                        <FolderCog size={16} className="group-hover:text-accent-DEFAULT transition-colors" />
                        <span>Proyecto</span>
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-titanium-700/50 transition-all text-xs font-medium group"
                    >
                        <Settings size={16} className="group-hover:text-accent-DEFAULT transition-colors" />
                        <span>Preferencias</span>
                    </button>

                    {/* 🟢 STATUS INDICATOR BUTTON */}
                    <button
                        onClick={onRefreshTokens}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-titanium-700/50 transition-all text-xs font-medium group ${status.color}`}
                        title="Click para renovar manualmente"
                    >
                        <status.icon size={16} className="transition-colors" />
                        <span>{status.text}</span>
                    </button>

                    <div className="h-px bg-titanium-700/50 my-1 mx-2"></div>

                    <button
                        onClick={onLogout}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-red-400 hover:bg-red-900/10 transition-all text-xs font-medium group"
                    >
                        <LogOut size={16} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </div>
        </aside >
    );
};

export default VaultSidebar;
