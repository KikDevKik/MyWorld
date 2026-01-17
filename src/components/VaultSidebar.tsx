import React, { useState, useEffect } from 'react';
import { Settings, LogOut, HelpCircle, HardDrive, BrainCircuit, ChevronDown, Key, FolderCog, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import FileTree from './FileTree';
import ProjectHUD from './forge/ProjectHUD';
import { useProjectConfig } from './ProjectConfigContext';
import { getFirestore, onSnapshot, collection, query, where } from "firebase/firestore";
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

    // 🟢 CONSUME GLOBAL CONTEXT
    const { fileTree, isFileTreeLoading } = useProjectConfig();

    // 🟢 CONFLICT STATE & FILTER
    const [conflictingFileIds, setConflictingFileIds] = useState<Set<string>>(new Set());
    const [showOnlyHealthy, setShowOnlyHealthy] = useState(false);

    // 🟢 LISTEN FOR CONFLICTS (Kept Local as it's UI specific, but could be lifted later)
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user || !isSecurityReady) return;

        const db = getFirestore();
        // Query TDB_Index/files where isConflicting == true
        const q = query(
            collection(db, "TDB_Index", user.uid, "files"),
            where("isConflicting", "==", true)
        );

        console.log("📡 Listening for Conflicting Files...");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const conflictIds = new Set<string>();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.driveId) {
                    conflictIds.add(data.driveId);
                }
            });
            console.log(`⚠️ Updated Conflicts: ${conflictIds.size} files`);
            setConflictingFileIds(conflictIds);
        });

        return () => unsubscribe();
    }, [isSecurityReady]);


    // 🟢 UPDATE TOP LEVEL FOLDERS WHEN TREE CHANGES
    useEffect(() => {
        if (fileTree && Array.isArray(fileTree)) {
             const folders = fileTree.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder');
             setTopLevelFolders(folders);
        } else {
             setTopLevelFolders([]);
        }
    }, [fileTree]);


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
        <div className="w-full h-full bg-titanium-900 flex flex-col z-20 select-none">

            {/* HEADER / SAGA SELECTOR */}
            <div className="px-4 py-4 border-b border-titanium-800 bg-titanium-900/50">
                <div className="flex items-center gap-2 mb-3">
                    <div className="text-titanium-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-xs font-medium text-titanium-400 uppercase tracking-wider">Manual de Campo</h2>

                    {/* TOGGLE FILTER */}
                    <button
                        onClick={() => setShowOnlyHealthy(!showOnlyHealthy)}
                        className={`ml-auto p-1.5 rounded-md hover:bg-titanium-700 transition-colors shrink-0 ${showOnlyHealthy ? 'text-emerald-400' : 'text-titanium-500'}`}
                        title={showOnlyHealthy ? "Mostrando solo archivos sanos" : "Mostrando todo (incluyendo conflictos)"}
                    >
                        {showOnlyHealthy ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>

                    {/* BOTÓN DE INDEXAR */}
                    <button
                        onClick={onIndexRequest}
                        className={`p-1.5 rounded-md hover:bg-titanium-700 transition-colors shrink-0 ${isIndexed ? 'text-green-500 hover:text-green-400' : 'text-titanium-400 hover:text-accent-DEFAULT'}`}
                        title={isIndexed ? "Memoria Sincronizada (Click para forzar)" : "Indexar Conocimiento (TDB)"}
                    >
                        <BrainCircuit size={16} />
                    </button>
                </div>

                {/* 🟢 CONNECT DRIVE BUTTON (IF NOT CONNECTED) */}
                {!folderId && (
                     <button
                        onClick={onOpenConnectModal}
                        className="w-full mb-3 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white py-2 rounded-lg text-xs font-bold uppercase tracking-wide shadow-lg hover:shadow-cyan-500/20 transition-all transform hover:scale-[1.02]"
                    >
                        <HardDrive size={14} />
                        Conectar Unidad
                    </button>
                )}

                <div className="relative">
                    <select
                        value={selectedSagaId || ''}
                        onChange={(e) => setSelectedSagaId(e.target.value || null)}
                        className="w-full appearance-none bg-titanium-950 hover:bg-titanium-900 text-sm font-medium text-titanium-100 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 cursor-pointer py-2 px-3 pr-8 rounded-md border border-titanium-700 transition-all"
                        disabled={!fileTree || fileTree.length === 0}
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

            {/* 🟢 PROJECT IDENTITY HUD (SENTINEL PULSE) */}
            <ProjectHUD />

            {/* FILE TREE */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                {isFileTreeLoading ? (
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
                         {/* 🟢 EMPTY STATE: NO FOLDER OR NO TREE */}
                         {!folderId ? (
                            <div className="flex flex-col items-center justify-center p-6 text-center gap-3 mt-10 animate-fade-in">
                                 <div className="p-3 bg-titanium-700/30 rounded-full animate-pulse">
                                     <HardDrive className="text-cyan-500" size={24} />
                                 </div>
                                 <h3 className="text-sm font-bold text-titanium-200">Sin Conexión</h3>
                                 <p className="text-xs text-titanium-400 leading-relaxed">
                                     Conecta una carpeta de Google Drive para cargar tu proyecto.
                                 </p>
                                 <button
                                     onClick={onOpenConnectModal}
                                     className="mt-2 text-xs bg-cyan-900/50 hover:bg-cyan-900 border border-cyan-700 text-cyan-100 px-4 py-2 rounded-lg transition-colors"
                                 >
                                     Conectar Ahora
                                 </button>
                             </div>
                         ) : fileTree && fileTree.length > 0 ? (
                            <FileTree
                                folderId={folderId} // ⚠️ Ignored if preloadedTree is passed
                                onFileSelect={onFileSelect}
                                accessToken={accessToken}
                                rootFilterId={selectedSagaId}
                                // onLoad is handled by parent subscription now
                                preloadedTree={fileTree} // 👈 PASS THE INDEXED TREE FROM CONTEXT
                                conflictingFileIds={conflictingFileIds} // 👈 PASS CONFLICTS
                                showOnlyHealthy={showOnlyHealthy} // 👈 PASS FILTER
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
            <div className="p-3 border-t border-titanium-800 bg-titanium-900 mt-auto">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={onOpenManual}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <HelpCircle size={16} className="group-hover:text-accent-DEFAULT transition-colors" />
                        <span>Manual de Campo</span>
                    </button>

                    <button
                        onClick={onOpenProjectSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <FolderCog size={16} className="group-hover:text-cyan-500 transition-colors" />
                        <span>Proyecto</span>
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <Settings size={16} className="group-hover:text-cyan-500 transition-colors" />
                        <span>Preferencias</span>
                    </button>

                    {/* 🟢 STATUS INDICATOR BUTTON */}
                    <button
                        onClick={onRefreshTokens}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-cyan-900/20 transition-all text-xs font-medium group ${status.color}`}
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
        </div>
    );
};

export default VaultSidebar;
