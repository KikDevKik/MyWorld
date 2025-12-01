import type { GemId, DriveFile } from '../types';
import ReactMarkdown from 'react-markdown';
import React, { useState, useCallback } from 'react';
import { GEMS } from '../constants';
import SettingsModal from './SettingsModal';
import ImageGenModal from './ImageGenModal';
import ChatPanel from './ChatPanel';
import { getFunctions, httpsCallable } from "firebase/functions"; // ¡EL ADAPTADOR VIP!
import { getAuth } from "firebase/auth"; // ¡EL PASE VIP (para el login)!

type ActiveTab = 'editor' | 'chat';

interface FileTreeProps {
  nodes: DriveFile[];
  onFileClick: (fileId: string) => void;
  onFolderToggle: (folderId: string) => void;
  openFolders: Record<string, boolean>;
  activeFileId: string | null;
  depth?: number;
}

const FileTree: React.FC<FileTreeProps> = ({ 
  nodes, 
  onFileClick, 
  onFolderToggle, 
  openFolders, 
  activeFileId, 
  depth = 0 
}) => {
  
  // ¡Ordenamos! Carpetas primero, luego archivos.
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sortedNodes.map(file => {
        const indentStyle = { paddingLeft: `${12 + depth * 16}px` };

        if (file.type === 'folder') {
          const isOpen = !!openFolders[file.id];
          return (
            <div key={file.id} className="flex flex-col">
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); onFolderToggle(file.id); }}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-text-secondary-dark hover:bg-white/5"
                style={indentStyle}
              >
                <span className="material-symbols-outlined text-lg">
                  {isOpen ? 'folder_open' : 'folder'}
                </span>
                <p className="text-sm font-medium leading-normal truncate">{file.name}</p>
              </a>
              {isOpen && file.children && (
                <div className="flex flex-col">
                  <FileTree
                    nodes={file.children}
                    onFileClick={onFileClick}
                    onFolderToggle={onFolderToggle}
                    openFolders={openFolders}
                    activeFileId={activeFileId}
                    depth={depth + 1}
                  />
                </div>
              )}
            </div>
          );
        }

        // Es un archivo
        return (
          <a 
            key={file.id} 
            href="#" 
            onClick={(e) => { e.preventDefault(); onFileClick(file.id); }}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeFileId === file.id ? 'bg-primary/20 text-primary' : 'text-text-secondary-dark hover:bg-white/5'}`}
            style={indentStyle}
          >
            <span className="material-symbols-outlined text-lg">
              description
            </span>
            <p className="text-sm font-medium leading-normal truncate">{file.name}</p>
          </a>
        );
      })}
    </>
  );
};

const IdeScreen: React.FC = () => {
    // --- 1. Conectar Adaptadores ---
    const functions = getFunctions(); // ¡Enciende el adaptador!
    const auth = getAuth(); // ¡Coge la llave del login!

    // --- 2. El "Cerebro" (Estados) ---
    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [isImageGenModalOpen, setImageGenModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
    const [activeGemId, setActiveGemId] = useState<GemId | null>(null);
    const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
    const [isIndexing, setIsIndexing] = useState(false);

    // --- 3. Los "Brazos" (Handlers) ---

    const handleGemClick = useCallback((gemId: GemId) => {
        setActiveGemId(gemId);
        setActiveTab('chat');
    }, []);

    // ¡EL "Botón Guardar" RE-CABLEADO (v1.4 - VIP)!
    const handleSaveSettings = useCallback(async (folderUrl: string) => {
        setSettingsModalOpen(false);
        setIsLoadingFiles(true);
        setFiles([]);
        setActiveFileId(null);
        setEditorContent('');

        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (!match || !match[1]) {
            alert("URL de Google Drive inválida. Pega la URL completa.");
            setIsLoadingFiles(false);
            return;
        }
        
        const folderId = match[1];
        setDriveFolderId(folderId);

        // ¡EL CABLEADO "VIP"!
        try {
            const getDriveFiles = httpsCallable(functions, "getDriveFiles");
            const result = await getDriveFiles({ folderId: folderId });
            const fetchedFiles = result.data as DriveFile[]; 

            setFiles(fetchedFiles);

            if (fetchedFiles.length > 0) {
                setActiveFileId(fetchedFiles[0].id); 
            }
        } catch (error) {
            console.error("¡El motor 'getDriveFiles' (VIP) falló!:", error);
            alert(`No se pudo conectar al motor de MyWord: ${(error as Error).message}`);
        } finally {
            setIsLoadingFiles(false);
        }
    }, [functions]); // ¡Le decimos que 'functions' es una dependencia!

    const handleIndexTDB = useCallback(async () => {
      if (!driveFolderId) {
        alert("¡Primero conecta tu carpeta de Drive en Ajustes!");
        return;
      }
      if (!window.confirm("¿Estás seguro de que quieres re-indexar TODO tu TDB_Vault? Esto puede tardar varios minutos.")) {
        return;
      }

      console.log("¡Iniciando indexado del TDB_Vault!");
      setIsIndexing(true);

      try {
        const indexTDB = httpsCallable(functions, "indexTDB");
        const result = await indexTDB({ folderId: driveFolderId });
        const data = result.data as { success: boolean, filesIndexed: number, totalChunks: number };
        
        alert(`¡Indexado completo! ${data.filesIndexed} archivos procesados, ${data.totalChunks} trozos creados.`);
        console.log("¡Indexado completado con éxito!", data);

      } catch (error) {
        console.error("¡El motor 'indexTDB' (VIP) falló!:", error);
        alert(`¡ERROR CATASTRÓFICO AL INDEXAR!: ${(error as Error).message}`);
      } finally {
        setIsIndexing(false);
      }
    }, [functions, driveFolderId]); // ¡Depende de 'functions' y 'driveFolderId'!

    // ¡¡¡NUEVA HERRAMIENTA DE BÚSQUEDA v2.0!!!
const findFileById = (nodes: DriveFile[], id: string): DriveFile | undefined => {
  for (const file of nodes) {
    if (file.id === id) return file;
    if (file.children) {
      const found = findFileById(file.children, id);
      if (found) return found;
    }
  }
  return undefined;
};


    const handleFileClick = async (fileId: string) => {
        const file = findFileById(files, fileId);
        if (!file) return;

        setActiveFileId(fileId);
        setActiveTab('editor');

        if (file.content !== undefined) {
            setEditorContent(file.content);
            return;
        }

        setIsLoadingContent(true);
        setEditorContent(""); 

        // ¡EL CABLEADO "PEREZOSO VIP"!
        try {
            const getDriveFileContent = httpsCallable(functions, "getDriveFileContent");
            const result = await getDriveFileContent({ fileId: fileId });
            const { content } = result.data as { content: string }; 

            setEditorContent(content);

            setFiles(currentFiles =>
                currentFiles.map(f =>
                    f.id === fileId ? { ...f, content } : f
                )
            );
        } catch (error) {
            console.error("Falló el motor 'getDriveFileContent' (VIP):", error);
            alert(`No se pudo cargar ese archivo: ${(error as Error).message}`);
            setEditorContent("Error al cargar el archivo. Revisa la conexión.");
        } finally {
            setIsLoadingContent(false);
        }
    };
    // ¡¡¡AÑADE ESTA FUNCIÓN ENTERA!!!
    const handleFolderToggle = (folderId: string) => {
      setOpenFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };

    // (El resto de funciones están perfectas)
    const handleEditorChange = (newContent: string) => {
        setEditorContent(newContent);
        if (activeFileId) {
            setFiles(currentFiles =>
                currentFiles.map(f =>
                    f.id === activeFileId ? { ...f, content: newContent } : f
                )
            );
        }
    };

    const getEditorPlaceholder = () => {
        if (!driveFolderId) return "Conecta tu carpeta de Google Drive en los ajustes para empezar.";
        if (files.length > 0 && !activeFileId) return "Selecciona un archivo para empezar a editar.";
        if (files.length === 0 && !isLoadingFiles) return "No se encontraron archivos en la carpeta de Drive.";
        return "# Título de tu Capítulo...";
    };


    // ¡AÑADE ESTO ANTES DEL 'return' (Línea 150 aprox)!
const activeFile = files.find(f => f.id === activeFileId);




    // --- 4. El "Cuerpo" (JSX) ---
    return (
        <div className="relative flex h-screen w-full flex-col bg-background-dark text-text-primary-dark font-display">
            <header className="flex h-12 w-full items-center justify-end border-b border-border-dark px-6 flex-shrink-0">
                <button onClick={() => setSettingsModalOpen(true)} className="text-text-secondary-dark hover:text-primary transition-colors">
                    <span className="material-symbols-outlined">settings</span>
                </button>
            </header>
            <main className="grid flex-1 grid-cols-[280px_1fr_320px] overflow-hidden">
                {/* File Explorer (Left Panel) */}
                <aside className="flex h-full flex-col border-r border-border-dark bg-panel-dark overflow-y-auto">
                    <div className="flex h-full min-h-0 flex-col justify-between p-4">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3 px-2">
                                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB3TKzko3BoWHfI5sLWpv3mUDEbp8bRDnkutcyn7ZGBoQ-BVdW3Ac8GqXdVCU6nw7fEC8xDUrN_7M_oQ7ZBV2XzvGqDki_MPzOCJiJ9U4f9VDwhzpo1ci2wzS6QrNvS8HJbs_44eX2Jt7WRPXmy0eS3rl6fALsFhwTo_XpScWmeXZej1OhfPegeWNGY-VGD6YwERU7y_nuoGUApZoK_gQopGBFt2RQ4gYx_6eyKHx68dAALcrML3nlOdnJlRjU1WN0YDUGbzOMHtF4")' }}></div>
                                {/* ¡¡¡BLOQUE MODIFICADO!!! */}
                            <div className="flex flex-col gap-2"> {/* ¡¡NUEVO 'flex-col'!! */}
                              <div className="flex items-center gap-3 px-2">
                                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB3TKzko3BoWHfI5sLWpv3mUDEbp8bRDnkutcyn7ZGBoQ-BVdW3Ac8GqXdVCU6nw7fEC8xDUrN_7M_oQ7ZBV2XzvGqDki_MPzOCJiJ9U4f9VDwhzpo1ci2wzS6QrNvS8HJbs_44eX2Jt7WRPXmy0eS3rl6fALsFhwTo_XpScWmeXZej1OhfPegeWNGY-VGD6YwERU7y_nuoGUApZoK_gQopGBFt2RQ4gYx_6eyKHx68dAALcrML3nlOdnJlRjU1WN0YDUGbzOMHtF4")' }}></div>
                                <div className="flex flex-col">
                                    <h1 className="text-text-primary-dark text-base font-bold leading-normal">MyWord Vault</h1>
                                    <p className="text-text-secondary-dark text-sm font-normal leading-normal">{driveFolderId ? "El Archivo" : "Conecta tu Drive"}</p>
                                </div>
                              </div>
                              
                              {/* ¡¡¡EL PUTO BOTÓN ROJO!!! */}
                              {driveFolderId && (
                                <button 
                                  onClick={handleIndexTDB} 
                                  disabled={isIndexing || isLoadingFiles}
                                  className="flex min-w-[84px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-3 bg-primary/20 text-primary text-sm font-bold leading-normal tracking-[0.015em] hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <span className="material-symbols-outlined mr-2">{isIndexing ? 'sync' : 'brain'}</span>
                                  <span className="truncate">{isIndexing ? 'Indexando Cerebro...' : 'Indexar TDB'}</span>
                                </button>
                              )}
                            </div>
                            {/* ¡¡¡FIN DEL BLOQUE MODIFICADO!!! */}
                            </div>
                            {/* ¡¡¡INICIO DEL BLOQUE REEMPLAZADO!!! */}
                            <div className="flex flex-col gap-1">
                                {isLoadingFiles || isIndexing ? ( // <-- ¡¡¡CAMBIO AQUÍ!!!
                                    <p className="text-text-secondary-dark text-sm p-2">
                                      {isIndexing ? 'Actualizando Cerebro...' : 'Cargando árbol...'}
                                    </p>
                                ) : (
                                    <FileTree
                                        nodes={files} 
                                        onFileClick={handleFileClick} 
                                        onFolderToggle={handleFolderToggle}
                                        openFolders={openFolders}
                                        activeFileId={activeFileId}
                                    />
                                )}
                            </div>
                            {/* ¡¡¡FIN DEL BLOQUE REEMPLAZADO!!! */}
                        </div>
                    </div>
                </aside>

                {/* Editor/Chat (Center Panel) */}
                <section className="flex flex-col bg-background-dark min-h-0">
                    <div className="flex border-b border-border-dark px-4 gap-8 flex-shrink-0">
                        <button onClick={() => setActiveTab('editor')}
                            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 transition-colors ${activeTab === 'editor' ? 'border-b-primary text-primary' : 'border-b-transparent text-text-secondary-dark hover:text-text-primary-dark'}`}>
                            
                            {/* ¡¡¡ARREGLO DE PESTAÑA LIMPIA!!! */}
                            <p className="text-sm font-bold leading-normal tracking-[0.015em]">
                              {activeFile ? activeFile.name.replace(/\.md$/, '') : 'Editor'}
                            </p>
                        
                        </button>
                        <button onClick={() => setActiveTab('chat')}
                            className={`flex flex-col items-center justify-center border-b-[3px] pb-[13px] pt-4 transition-colors ${activeTab === 'chat' ? 'border-b-primary text-primary' : 'border-b-transparent text-text-secondary-dark hover:text-text-primary-dark'}`}>
                            <p className="text-sm font-bold leading-normal tracking-[0.015em]">Chat de Gems</p>
                        </button>
                    </div>
                    
                    {/* ¡¡¡ARREGLO DE RENDERIZADO!!! (¡ESTE ES EL BUENO!) */}
                    {activeTab === 'editor' ? (
                        <div 
                          className="prose-like max-w-none flex-1 overflow-auto p-6" 
                          style={{ whiteSpace: 'pre-wrap' }}
                        >
                            {isLoadingContent ? (
                                <div className="flex items-center justify-center h-full text-text-secondary-dark">
                                    <p>Cargando contenido...</p>
                                </div>
                            ) : (
                                <ReactMarkdown>
                                    {editorContent || getEditorPlaceholder()}
                                </ReactMarkdown>
                            )}
                        </div>
                    ) : (
                        <ChatPanel activeGemId={activeGemId} />
                    )}
                </section>

                {/* Arsenal (Right Panel) */}
                <aside className="flex flex-col border-l border-border-dark bg-panel-dark p-4 overflow-y-auto">
                    <h2 className="text-text-secondary-dark font-bold text-sm uppercase tracking-wider px-2 pb-2">El Arsenal</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {(Object.values(GEMS)).map(gem => (
                            <div key={gem.id} onClick={() => handleGemClick(gem.id)}
                                className={`bg-cover bg-center flex flex-col gap-3 rounded-lg justify-end p-4 aspect-square cursor-pointer transition-all ${activeGemId === gem.id ? 'outline outline-2 outline-primary' : 'hover:outline hover:outline-2 hover:outline-primary/50'}`}
                                style={{ backgroundImage: gem.backgroundImage }}>
                                <p className="text-white text-base font-bold leading-tight">{gem.name}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4">
                        <button onClick={() => setImageGenModalOpen(true)} className="flex min-w-[84px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 flex-1 bg-primary text-background-dark gap-2 pl-5 text-base font-bold leading-normal tracking-[0.015em] hover:bg-primary/90 transition-colors">
                            <span className="material-symbols-outlined">auto_awesome</span>
                            <span className="truncate">Generar Imagen</span>
                        </button>
                    </div>
                </aside>
            </main>
            
            {isSettingsModalOpen && <SettingsModal onSave={handleSaveSettings} onClose={() => setSettingsModalOpen(false)} />}
            {isImageGenModalOpen && <ImageGenModal onClose={() => setImageGenModalOpen(false)} />}
        </div>

        
    );
    
};
;

export default IdeScreen; // ¡¡¡Y LA LLAVE CIERRA EL COMPONENTE Y LUEGO LO EXPORTA!!!


