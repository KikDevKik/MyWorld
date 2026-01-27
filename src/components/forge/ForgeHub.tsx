import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Folder, Loader2, Book, AlertTriangle, ChevronRight } from 'lucide-react';
import { DriveFile } from '../../types';

interface ForgeHubProps {
    vaultId: string;
    accessToken: string | null;
    onSelectSaga: (saga: DriveFile) => void;
}

const ForgeHub: React.FC<ForgeHubProps> = ({ vaultId, accessToken, onSelectSaga }) => {
    const [sagas, setSagas] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSagas = async () => {
            if (!vaultId || !accessToken) return;

            setLoading(true);
            try {
                const functions = getFunctions();
                const getDriveFiles = httpsCallable(functions, 'getDriveFiles');

                // Request non-recursive scan of the vault to get top-level folders (Sagas)
                const result: any = await getDriveFiles({
                    folderIds: [vaultId],
                    accessToken,
                    recursive: false
                });

                const files = result.data as DriveFile[];

                // Assuming result.data returns a tree where the root nodes are the requested folders.
                // Wait, getDriveFiles returns an array of root nodes (DriveFile).
                // Each root node has children.
                // If I pass folderIds=[vaultId], I get back [ { id: vaultId, children: [...] } ]

                if (files && files.length > 0 && files[0].children) {
                    // Filter for Folders only
                    const folders = files[0].children.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                    setSagas(folders);
                } else {
                    setSagas([]);
                }
            } catch (err: any) {
                console.error("Error fetching sagas:", err);
                setError(err.message || "Failed to load sagas.");
            } finally {
                setLoading(false);
            }
        };

        fetchSagas();
    }, [vaultId, accessToken]);

    if (loading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-500 gap-4">
                <Loader2 size={40} className="animate-spin text-accent-DEFAULT" />
                <div className="text-center">
                    <p className="text-lg font-bold text-titanium-200">Escaneando Bóveda Maestra...</p>
                    <p className="text-xs font-mono opacity-70">Detectando Sagas y Libros</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-red-400 gap-4">
                <AlertTriangle size={40} />
                <p>Error de Conexión: {error}</p>
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
        <div className="w-full h-full bg-titanium-950 p-8 flex flex-col animate-fade-in">
            {/* HERO */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl font-bold text-titanium-100 mb-2 tracking-tight">El Hub</h1>
                <p className="text-titanium-400">Selecciona la Saga o Libro para despertar a sus personajes.</p>
            </div>

            {/* GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto w-full">

                {/* EMPTY STATE */}
                {sagas.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-titanium-800 rounded-2xl text-titanium-600 bg-titanium-900/30">
                        <Folder size={48} className="mb-4 opacity-50" />
                        <p className="font-bold">Bóveda Vacía</p>
                        <p className="text-sm">No se encontraron subcarpetas (Sagas) en esta Bóveda.</p>
                    </div>
                )}

                {/* SAGA CARDS */}
                {sagas.map(saga => (
                    <button
                        key={saga.id}
                        onClick={() => onSelectSaga(saga)}
                        className="group relative flex flex-col items-start p-6 bg-titanium-900 border border-titanium-800 rounded-2xl hover:bg-titanium-800 hover:border-accent-DEFAULT/50 hover:shadow-2xl hover:shadow-accent-DEFAULT/10 transition-all duration-300 text-left h-48 w-full"
                    >
                        <div className="mb-auto p-3 bg-titanium-950 rounded-xl text-titanium-400 group-hover:text-accent-DEFAULT group-hover:scale-110 transition-all duration-300">
                            <Book size={24} />
                        </div>

                        <div className="w-full">
                            <h3 className="font-bold text-lg text-titanium-200 group-hover:text-white mb-1 truncate w-full">
                                {saga.name}
                            </h3>
                            <div className="flex items-center text-xs text-titanium-500 font-mono group-hover:text-titanium-400">
                                <span>Entrar al Nexus</span>
                                <ChevronRight size={12} className="ml-1 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>

                        {/* DECORATIVE CORNER */}
                        <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-2 h-2 rounded-full bg-accent-DEFAULT shadow-[0_0_8px_rgba(255,255,255,0.5)]"></div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ForgeHub;
