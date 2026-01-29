import React, { useState, useRef, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import type { ChatMessage, GemId, Gem, DriveFile } from '../types';
import { GEMS } from '../constants';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { X, FileText, Paperclip, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChatPanelProps {
  activeGemId: GemId | null;
  initialMessage?: string | null;
  onMessageSent?: () => void;
  isOpen: boolean;
  onClose: () => void;
  isFullWidth?: boolean;
  categoryFilter?: 'canon' | 'reference';
  customGem?: Gem;
  folderId?: string;
  accessToken?: string | null; // 🟢 Needed for content fetching
  activeFileContent?: string;
  activeFileName?: string;
  isFallbackContext?: boolean;
}

interface Source {
  text: string;
  fileName: string;
}

interface ExtendedChatMessage extends ChatMessage {
  sources?: Source[];
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  activeGemId,
  initialMessage,
  onMessageSent,
  isOpen,
  onClose,
  isFullWidth = false,
  categoryFilter,
  customGem,
  folderId,
  accessToken,
  activeFileContent,
  activeFileName,
  isFallbackContext
}) => {
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<DriveFile[]>([]); // 🟢 Context Chips
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeGem = customGem || (activeGemId ? GEMS[activeGemId] : null);

  useEffect(() => {
    if (initialMessage) {
      handleSendMessage(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 🟢 DRAG & DROP HANDLERS
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    try {
        const data = e.dataTransfer.getData("application/json");
        if (data) {
            const file = JSON.parse(data) as DriveFile;
            // Avoid duplicates
            if (!attachedFiles.some(f => f.id === file.id)) {
                setAttachedFiles(prev => [...prev, file]);
            }
        }
    } catch (err) {
        console.error("Drop failed:", err);
    }
  };

  const removeAttachedFile = (id: string) => {
      setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !activeGem) return;

    const userMessage: ExtendedChatMessage = { role: 'user', text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const functions = getFunctions();

      // 🟢 1. FETCH CONTENT FOR ATTACHED FILES
      let enrichedFiles: any[] = [];
      if (attachedFiles.length > 0 && accessToken) {
          const getContent = httpsCallable(functions, 'getDriveFileContent');

          const promises = attachedFiles.map(async (file) => {
              try {
                  // Only fetch text-readable files
                  if (file.mimeType.includes('pdf') || file.mimeType.includes('image')) {
                      // Skip content fetching for now, or handle differently
                      return { name: file.name, content: "[Binary File - Skipped]" };
                  }

                  const res = await getContent({ fileId: file.id, accessToken });
                  const data = res.data as any;
                  return { name: file.name, content: data.content };
              } catch (e) {
                  console.error(`Failed to read ${file.name}`, e);
                  return { name: file.name, content: "Error reading file." };
              }
          });

          enrichedFiles = await Promise.all(promises);
      }

      // 🟢 2. SEND TO CHAT
      const chatWithGem = httpsCallable(functions, 'chatWithGem', { timeout: 540000 });

      const result = await chatWithGem({
        query: text,
        systemInstruction: activeGem.systemInstruction,
        history: messages.map(m => ({ role: m.role, message: m.text })),
        categoryFilter: categoryFilter,
        projectId: folderId || undefined,
        activeFileContent: activeFileContent || "",
        activeFileName: activeFileName || "",
        isFallbackContext: isFallbackContext,
        attachedFiles: enrichedFiles // 👈 Pass Enriched Context
      });

      const data = result.data as any;
      const aiMessage: ExtendedChatMessage = {
        role: 'model',
        text: data.response,
        sources: data.sources
      };

      setMessages(prev => [...prev, aiMessage]);
      setAttachedFiles([]); // Clear after send
      onMessageSent?.();

    } catch (error) {
      console.error("Error:", error);
      const errorMessage: ExtendedChatMessage = { role: 'model', text: `Error: ${(error as Error).message}` };
      setMessages(prev => [...prev.slice(0, -1), errorMessage]);
      toast.error("Error al procesar mensaje");
    } finally {
      setIsLoading(false);
    }
  };

  const baseClasses = "flex flex-col h-full w-full bg-titanium-950 border-l border-titanium-800 transition-all duration-300";

  if (!isOpen && !isFullWidth) return null;

  return (
    <div
        className={baseClasses}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      {/* DRAG OVERLAY */}
      {isDragging && (
          <div className="absolute inset-0 bg-emerald-500/20 z-50 flex items-center justify-center border-2 border-emerald-500 border-dashed backdrop-blur-sm">
              <div className="text-emerald-400 font-bold text-xl flex items-center gap-3">
                  <Paperclip size={32} />
                  Soltar para adjuntar contexto
              </div>
          </div>
      )}

      {/* HEADER */}
      <div className="p-4 border-b border-titanium-800 flex items-center justify-between bg-titanium-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {activeGem && (
            <>
              <div className={`w-2 h-2 rounded-full ${activeGem.color === 'blue' ? 'bg-blue-500' : activeGem.color === 'purple' ? 'bg-purple-500' : activeGem.color === 'emerald' ? 'bg-emerald-500' : 'bg-green-500'} shadow-[0_0_10px_currentColor]`} />
              <span className="font-bold text-titanium-100 tracking-wide">{activeGem.name}</span>
            </>
          )}
          {!activeGem && <span className="text-titanium-500 text-sm">Sistema Inactivo</span>}
        </div>
        <button
          onClick={onClose}
          className="text-titanium-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${msg.role === 'user'
                ? 'bg-titanium-800 text-titanium-100 rounded-br-none border border-titanium-700'
                : 'bg-titanium-900 text-titanium-200 rounded-bl-none border border-titanium-800'
                }`}
            >
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>

            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 max-w-[85%]">
                {msg.sources.map((source, i) => (
                  <div key={i} className="text-[10px] bg-titanium-900 border border-titanium-800 text-titanium-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-titanium-800 transition-colors cursor-help" title={source.text}>
                    <span>📄</span>
                    <span className="truncate max-w-[150px]">{source.fileName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-titanium-900 rounded-2xl px-4 py-3 border border-titanium-800">
                <Loader2 size={16} className="animate-spin text-titanium-500" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="p-4 border-t border-titanium-800 bg-titanium-900/30">

        {/* 🟢 CONTEXT CHIPS */}
        {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
                {attachedFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-2 bg-titanium-800 border border-titanium-700 text-titanium-200 px-2 py-1 rounded text-xs animate-in fade-in zoom-in duration-200">
                        <FileText size={12} className="text-emerald-400" />
                        <span className="max-w-[100px] truncate">{file.name}</span>
                        <button onClick={() => removeAttachedFile(file.id)} className="hover:text-red-400"><X size={12}/></button>
                    </div>
                ))}
            </div>
        )}

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(input);
              }
            }}
            placeholder={activeGem ? `Escribe a ${activeGem.name}...` : "Selecciona una herramienta..."}
            disabled={!activeGem || isLoading}
            className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-emerald-500 transition-all resize-none h-[52px] max-h-[150px] overflow-y-auto scrollbar-hide"
          />
          <button
            onClick={() => handleSendMessage(input)}
            disabled={!input.trim() || !activeGem || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-titanium-800 text-titanium-400 rounded-lg hover:bg-titanium-700 hover:text-white disabled:opacity-50 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div className="text-[10px] text-center mt-2 text-titanium-600 flex justify-between px-2">
            <span>Arrastra archivos aquí para analizarlos</span>
            <span>Enter para enviar</span>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;