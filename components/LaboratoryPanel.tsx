import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { X, FlaskConical, Book, FileText, Image as ImageIcon, Link as LinkIcon, Loader2, FolderOpen, RefreshCw, BookOpen, MessageSquare } from 'lucide-react';
import { DriveFile, Gem } from '../types';
import { toast } from 'sonner';
import ChatPanel from './ChatPanel';

interface LaboratoryPanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

const LaboratoryPanel: React.FC<LaboratoryPanelProps> = ({ onClose, folderId, accessToken }) => {
    const [activeTab, setActiveTab] = useState<'canon' | 'reference'>('canon');
    const [canonFiles, setCanonFiles] = useState<DriveFile[]>([]);
    const [referenceFiles, setReferenceFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(false);

    // 🟢 CHAT STATE
    const [isResearchChatOpen, setIsResearchChatOpen] = useState(false);
    const [chatInitialMessage, setChatInitialMessage] = useState<string | null>(null);

    // 🟢 FETCH FILES ON MOUNT
    useEffect(() => {
        if (folderId && accessToken) {
            fetchFiles();
        }
    }, [folderId, accessToken]);

    const fetchFiles = async () => {
        setLoading(true);
        const functions = getFunctions();
        const getDriveFiles = httpsCallable(functions, 'getDriveFiles');

        try {
            const response = await getDriveFiles({ folderId, accessToken, recursive: true });
            const allFiles = response.data as DriveFile[];

            // Flatten and categorize
            const { canon, reference } = flattenAndCategorize(allFiles);
            setCanonFiles(canon);
            setReferenceFiles(reference);

        } catch (error) {
            console.error("Error fetching files:", error);
            toast.error("Error al cargar el laboratorio.");
        } finally {
            setLoading(false);
        }
    };

    // Helper to flatten the tree and categorize
    const flattenAndCategorize = (nodes: DriveFile[], isResourceFolder = false): { canon: DriveFile[], reference: DriveFile[] } => {
        let canon: DriveFile[] = [];
        let reference: DriveFile[] = [];

        for (const node of nodes) {
            const currentIsResource = isResourceFolder || (node.type === 'folder' && node.name.startsWith('_RESOURCES'));

            if (node.type === 'file') {
                const fileWithCategory = { ...node, category: currentIsResource ? 'reference' : 'canon' } as DriveFile;

                if (currentIsResource) {
                    reference.push(fileWithCategory);
                } else {
                    canon.push(fileWithCategory);
                }
            }

            if (node.children) {
                const childrenResult = flattenAndCategorize(node.children, currentIsResource);
                canon.push(...childrenResult.canon);
                reference.push(...childrenResult.reference);
            }
        }
        return { canon, reference };
    };

    // 🟢 GET CURRENT FILES BASED ON TAB
    const currentFiles = activeTab === 'canon' ? canonFiles : referenceFiles;

    const getFileIcon = (mimeType: string) => {
        if (mimeType.includes('pdf')) return <Book size={24} className="text-red-400" />;
        if (mimeType.includes('image')) return <ImageIcon size={24} className="text-purple-400" />;
        return <FileText size={24} className="text-blue-400" />;
    };

    // 🟢 OPEN CHAT HANDLERS
    const handleOpenLibraryChat = () => {
        setChatInitialMessage("Hola, necesito ayuda para investigar mis referencias.");
        setIsResearchChatOpen(true);
    };

    const handleStudyFile = (fileName: string) => {
        setChatInitialMessage(`Quiero estudiar el archivo "${fileName}". ¿Qué información clave contiene?`);
        setIsResearchChatOpen(true);
    };

    // 🟢 VIRTUAL GEM: THE LIBRARIAN
    const librarianGem: Gem = {
        id: 'laboratorio', // Reusing ID or could be 'bibliotecario' if added to types
        name: 'El Bibliotecario',
        model: 'gemini-2.5-flash',
        color: 'emerald',
        backgroundImage: '', // No background needed for virtual gem
        systemInstruction: `Eres el Bibliotecario, el guardián del conocimiento.
        Tu misión es ayudar al usuario a navegar, entender y extraer información de sus MATERIALES DE REFERENCIA.
        
        PROTOCOLO:
        1. Responde basándote EXCLUSIVAMENTE en el material de referencia proporcionado (RAG).
        2. Si la respuesta no está en los documentos, dilo claramente.
        3. Sé preciso, académico pero accesible, y cita tus fuentes siempre que sea posible.
        4. Ayuda a conectar puntos entre diferentes documentos de referencia.`
    };

    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in text-titanium-100 relative">
            {/* HEADER */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shadow-md z-10">
                <div className="flex items-center gap-3 text-emerald-500">
                    <FlaskConical size={24} />
                    <h2 className="font-bold text-xl text-titanium-100 tracking-wider">LABORATORIO</h2>
                </div>

                {/* TABS */}
                <div className="flex bg-titanium-950 p-1 rounded-lg border border-titanium-800">
                    <button
                        onClick={() => setActiveTab('canon')}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'canon'
                            ? 'bg-titanium-800 text-white shadow-sm'
                            : 'text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <FolderOpen size={16} />
                        PROYECTO
                    </button>
                    <button
                        onClick={() => setActiveTab('reference')}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'reference'
                            ? 'bg-titanium-800 text-white shadow-sm'
                            : 'text-titanium-400 hover:text-titanium-200'
                            }`}
                    >
                        <Book size={16} />
                        BIBLIOTECA
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {/* 🟢 LIBRARY CHAT BUTTON */}
                    {activeTab === 'reference' && (
                        <button
                            onClick={handleOpenLibraryChat}
                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 rounded-lg hover:bg-emerald-900/50 transition-all text-sm font-medium mr-2"
                        >
                            <MessageSquare size={16} />
                            Hablar con la Biblioteca
                        </button>
                    )}

                    <button
                        onClick={fetchFiles}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                        title="Recargar"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-8 bg-titanium-950/50">
                {loading && currentFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-titanium-500 gap-4">
                        <Loader2 size={48} className="animate-spin text-emerald-500" />
                        <p className="animate-pulse">Analizando muestras...</p>
                    </div>
                ) : currentFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-titanium-600 opacity-50">
                        <FlaskConical size={64} className="mb-4" />
                        <p className="text-lg font-medium">
                            {activeTab === 'canon' ? 'El proyecto está vacío.' : 'La biblioteca está vacía.'}
                        </p>
                        <p className="text-sm">
                            {activeTab === 'canon'
                                ? 'Crea archivos en la raíz para verlos aquí.'
                                : 'Crea una carpeta "_RESOURCES" en Drive para añadir referencias.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {currentFiles.map((file) => (
                            <div
                                key={file.id}
                                className="bg-titanium-900 border border-titanium-800 rounded-xl p-4 hover:border-emerald-500/50 transition-all group relative flex flex-col gap-3 shadow-lg hover:shadow-emerald-900/10"
                            >
                                <div className="aspect-square bg-titanium-950 rounded-lg flex items-center justify-center relative overflow-hidden">
                                    <div className="opacity-50 group-hover:opacity-100 transition-opacity transform group-hover:scale-110 duration-500">
                                        {getFileIcon(file.mimeType)}
                                    </div>

                                    {/* 🟢 STUDY BUTTON OVERLAY */}
                                    {activeTab === 'reference' && (
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => handleStudyFile(file.name)}
                                                className="bg-emerald-600 text-white p-2 rounded-full hover:bg-emerald-500 transform hover:scale-110 transition-all shadow-lg"
                                                title="Estudiar este archivo"
                                            >
                                                <BookOpen size={20} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-bold text-titanium-200 text-sm truncate" title={file.name}>
                                        {file.name}
                                    </h3>
                                    <p className="text-[10px] text-titanium-500 uppercase tracking-wider mt-1">
                                        {file.mimeType.split('.').pop()?.replace('vnd.google-apps.', '')}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 🟢 RESEARCH CHAT OVERLAY */}
            {isResearchChatOpen && (
                <div className="absolute inset-0 z-50 bg-titanium-950/95 backdrop-blur-sm flex justify-end">
                    <div className="w-[500px] h-full border-l border-titanium-800 shadow-2xl animate-slide-in-right">
                        <ChatPanel
                            isOpen={true}
                            onClose={() => setIsResearchChatOpen(false)}
                            activeGemId={null} // We use customGem instead
                            customGem={librarianGem}
                            initialMessage={chatInitialMessage}
                            isFullWidth={true} // Fill the container
                            categoryFilter="reference"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaboratoryPanel;
