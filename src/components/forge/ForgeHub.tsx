import React, { useEffect, useState } from 'react';
import { Folder, Loader2, Book, AlertTriangle, ChevronRight, Home, ArrowLeft, Hammer } from 'lucide-react';
import { DriveFile, ProjectPath } from '../../types';
import { callFunction } from '../../services/api';

interface ForgeHubProps {
    roots: ProjectPath[]; // 🟢 CHANGED: Multi-root support
    accessToken: string | null;
    onSelectSaga: (saga: DriveFile) => void;
}

const ForgeHub: React.FC<ForgeHubProps> = ({ roots, accessToken, onSelectSaga }) => {
    // STATE
    const [currentPath, setCurrentPath] = useState<ProjectPath[]>([]); // Breadcrumbs
    const [folders, setFolders] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // FETCH LOGIC
    useEffect(() => {
        const fetchContents = async () => {
            console.log("ForgeHub Fetching:", { currentPath, roots });

            setLoading(true);
            setError(null);

            try {
                // SCENARIO 1: ROOT VIEW (List of Canon Paths)
                if (currentPath.length === 0) {
                    // Convert ProjectPaths to DriveFiles for consistent rendering
                    const rootNodes: DriveFile[] = roots.map(p => ({
                        id: p.id,
                        name: p.name,
                        type: 'folder',
                        mimeType: 'application/vnd.google-apps.folder',
                        path: p.name
                    }));
                    setFolders(rootNodes);
                    setLoading(false);
                    return;
                }

                // SCENARIO 2: DEEP DIVE
                // 🟢 GHOST MODE BYPASS: Allow deep dive without token in dev mode
                const isGhostMode = import.meta.env.VITE_JULES_MODE === 'true';
                if (!accessToken && !isGhostMode) {
                    // Only enforce token for deep dive
                    setError("Conexión perdida. Por favor recarga.");
                    setLoading(false);
                    return;
                }

                const currentFolder = currentPath[currentPath.length - 1];

                const files = await callFunction<DriveFile[]>('getDriveFiles', {
                    folderIds: [currentFolder.id],
                    accessToken,
                    recursive: false
                });

                if (files && files.length > 0 && files[0].children) {
                    // Filter for Folders only (Navigation Mode)
                    // We only want to show containers (Sagas/Books)
                    const subfolders = files[0].children.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                    setFolders(subfolders);
                } else {
                    setFolders([]);
                }

            } catch (err: any) {
                console.error("Error fetching folder contents:", err);
                setError(err.message || "Failed to load contents.");
            } finally {
                setLoading(false);
            }
        };

        fetchContents();
    }, [currentPath, roots, accessToken]);

    // HANDLERS
    const handleEnterFolder = (folder: DriveFile) => {
        setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    };

    const handleNavigateUp = () => {
        setCurrentPath(prev => prev.slice(0, -1));
    };

    const handleBreadcrumbClick = (index: number) => {
        setCurrentPath(prev => prev.slice(0, index + 1));
    };

    const handleHomeClick = () => {
        setCurrentPath([]);
    };

    // RENDER
    if (loading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-500 gap-4">
                <Loader2 size={40} className="animate-spin text-accent-DEFAULT" />
                <div className="text-center">
                    <p className="text-lg font-bold text-titanium-200">Explorando el Multiverso...</p>
                    <p className="text-xs font-mono opacity-70">Buscando Sagas</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-red-400 gap-4">
                <AlertTriangle size={40} />
                <p>Error de Navegación: {error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-titanium-900 rounded hover:bg-titanium-800 text-titanium-200"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-titanium-950 flex flex-col animate-fade-in">

            {/* 🟢 NAVIGATION BAR */}
            <div className="h-14 flex items-center px-6 border-b border-titanium-800 bg-titanium-900/50 shrink-0 gap-2">
                <button
                    onClick={handleHomeClick}
                    className={`p-2 rounded-lg transition-colors ${currentPath.length === 0 ? 'text-accent-DEFAULT bg-accent-DEFAULT/10' : 'text-titanium-400 hover:text-white hover:bg-titanium-800'}`}
                    title="Inicio"
                >
                    <Home size={18} />
                </button>

                {currentPath.length > 0 && (
                    <>
                        <ChevronRight size={14} className="text-titanium-600" />
                        {currentPath.map((crumb, idx) => (
                            <React.Fragment key={crumb.id}>
                                <button
                                    onClick={() => handleBreadcrumbClick(idx)}
                                    className={`text-sm font-medium transition-colors hover:text-white truncate max-w-[150px]
                                        ${idx === currentPath.length - 1 ? 'text-titanium-200' : 'text-titanium-400'}
                                    `}
                                >
                                    {crumb.name}
                                </button>
                                {idx < currentPath.length - 1 && <ChevronRight size={14} className="text-titanium-600" />}
                            </React.Fragment>
                        ))}
                    </>
                )}
            </div>

            {/* 🟢 CONTENT GRID */}
            <div className="flex-1 overflow-y-auto p-8">

                {/* HERO (Only on Root) */}
                {currentPath.length === 0 && (
                    <div className="mb-10 text-center">
                        <h1 className="text-3xl font-bold text-titanium-100 mb-2 tracking-tight">El Hub</h1>
                        <p className="text-titanium-400">Navega por tus carpetas Canon hasta encontrar la Saga que deseas despertar.</p>
                    </div>
                )}

                {/* EMPTY STATE */}
                {folders.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-titanium-800 rounded-2xl text-titanium-600 bg-titanium-900/30 max-w-2xl mx-auto mt-10">
                        <Folder size={48} className="mb-4 opacity-50" />
                        <p className="font-bold">Carpeta Vacía</p>
                        <p className="text-sm text-center mb-6">No hay subcarpetas aquí.</p>

                        {/* If empty, allow selecting THIS folder as the saga? */}
                        {currentPath.length > 0 && (
                            <button
                                onClick={() => {
                                    const current = currentPath[currentPath.length - 1];
                                    onSelectSaga({
                                        id: current.id,
                                        name: current.name,
                                        type: 'folder',
                                        mimeType: 'application/vnd.google-apps.folder'
                                    });
                                }}
                                className="px-6 py-3 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 font-bold rounded-xl shadow-lg flex items-center gap-2"
                            >
                                <Hammer size={18} />
                                <span>Forjar Aquí ({currentPath[currentPath.length - 1].name})</span>
                            </button>
                        )}
                    </div>
                )}

                {/* FOLDER CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
                    {folders.map(folder => (
                        <div
                            key={folder.id}
                            className="group relative flex flex-col bg-titanium-900 border border-titanium-800 rounded-2xl hover:border-titanium-600 transition-all duration-300 h-56 overflow-hidden shadow-sm hover:shadow-xl"
                        >
                            {/* CARD BODY (CLICK TO ENTER) */}
                            <button
                                onClick={() => handleEnterFolder(folder)}
                                className="flex-1 p-6 flex flex-col items-start w-full text-left"
                            >
                                <div className="mb-auto p-3 bg-titanium-950 rounded-xl text-titanium-400 group-hover:text-white transition-colors border border-titanium-800">
                                    <Folder size={24} />
                                </div>
                                <h3 className="font-bold text-lg text-titanium-200 group-hover:text-white mb-1 truncate w-full">
                                    {folder.name}
                                </h3>
                                <div className="flex items-center text-xs text-titanium-500 font-mono group-hover:text-titanium-400">
                                    <span>Explorar contenido</span>
                                    <ChevronRight size={12} className="ml-1" />
                                </div>
                            </button>

                            {/* CARD FOOTER (ACTION BUTTON) */}
                            <div className="p-3 bg-titanium-950 border-t border-titanium-800 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-0 w-full translate-y-full group-hover:translate-y-0">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectSaga(folder);
                                    }}
                                    className="w-full py-2 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg"
                                >
                                    <Hammer size={14} />
                                    <span>SELECCIONAR SAGA</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ForgeHub;
