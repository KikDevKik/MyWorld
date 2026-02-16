import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { ChatMessage, GemId, Gem, DriveFile } from '../types';
import { callFunction } from '../services/api';
import { GEMS } from '../constants';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { remarkThinking } from '../utils/remarkThinking';
import { X, FileText, Paperclip, Loader2, Folder, Gem as GemIcon, ChevronDown, ChevronRight, BrainCircuit } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';
import ContextSelectorModal from './ContextSelectorModal';
import ChatInput from './ui/ChatInput';
import { fileToGenerativePart } from '../services/geminiService';

const REMARK_PLUGINS = [remarkGfm, remarkBreaks, remarkThinking];

// Helper to remove thinking block for crystallization (saving to file)
const stripThinking = (text: string) => {
    return text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
};

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
  emptyStateComponent?: React.ReactNode;
}

interface Source {
  text: string;
  fileName: string;
}

interface ExtendedChatMessage extends ChatMessage {
  sources?: Source[];
  contextFiles?: DriveFile[]; // 🟢 Context Snapshot for Smart Patch
  attachmentPreview?: string;
  attachmentType?: 'image' | 'audio';
}

interface ChatMessageItemProps {
    msg: ExtendedChatMessage;
    onCrystallize: (msg: ExtendedChatMessage) => void;
}

// ⚡ Bolt Optimization: Memoized component to prevent re-rendering all messages
// when parent state changes (e.g. typing in input). REMARK_PLUGINS is also constant.
const ChatMessageItem = memo(({ msg, onCrystallize }: ChatMessageItemProps) => {
    return (
        <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            {/* 🟢 ATTACHMENT PREVIEW */}
            {msg.attachmentPreview && (
                <div className={`mb-1 rounded-lg overflow-hidden border border-white/10 max-w-[85%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                    {msg.attachmentType === 'audio' ? (
                        <audio controls src={msg.attachmentPreview} className="w-full" />
                    ) : (
                        <img src={msg.attachmentPreview} alt="Attachment" className="max-w-full h-auto max-h-60 object-cover" />
                    )}
                </div>
            )}

            <div
                tabIndex={0} // 🎨 PALETTE: Make message focusable for accessibility
                role="article"
                aria-label={msg.role === 'user' ? 'Your message' : 'AI response'}
                className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${msg.role === 'user'
                    ? 'bg-titanium-800 text-titanium-100 rounded-br-none border border-titanium-700'
                    : 'bg-titanium-900 text-titanium-200 rounded-bl-none border border-titanium-800'
                    }`}
            >
                {/* 🟢 MARKDOWN CONTENT (With Collapsible Thinking) */}
                <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={REMARK_PLUGINS}
                        components={{
                            // Ensure details and summary are rendered correctly if not handled by default
                            details: ({node, ...props}) => <details {...props} />,
                            summary: ({node, ...props}) => <summary {...props} />
                        }}
                    >
                        {msg.text}
                    </ReactMarkdown>
                </div>

                {/* 🟢 CRYSTAL BUTTON */}
                {msg.role === 'model' && (
                    <button
                        onClick={() => onCrystallize(msg)}
                        // 🎨 PALETTE: Improved visibility logic (focus-within)
                        className="absolute -bottom-3 right-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100 focus-visible:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 bg-titanium-950 border border-emerald-500/30 p-1.5 rounded-full text-emerald-400 hover:text-white hover:bg-emerald-600 hover:border-emerald-500 shadow-lg shadow-emerald-900/20 z-10 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        title="Cristalizar esta idea"
                        aria-label="Cristalizar esta idea"
                    >
                        <GemIcon size={14} />
                    </button>
                )}
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
    );
});

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
  isFallbackContext,
  emptyStateComponent
}) => {
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<DriveFile[]>([]); // 🟢 Context Chips
  const [isDragging, setIsDragging] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const { currentLanguage } = useLanguageStore();
  const t = TRANSLATIONS[currentLanguage];

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeGem = customGem || (activeGemId ? GEMS[activeGemId] : null);

  const displayGemName = customGem
      ? customGem.name
      : (activeGemId && t.tools[activeGemId] ? t.tools[activeGemId] : (activeGem?.name || ""));

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
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
    }
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

  // ⚡ Bolt Optimization: Stable callback reference for memoized children
  const handleCrystallize = useCallback(async (msg: ExtendedChatMessage) => {
      if (!accessToken || !folderId) {
          toast.error("No hay acceso a Drive configurado.");
          return;
      }

      const context = msg.contextFiles || [];
      const cleanText = stripThinking(msg.text);

      if (context.length === 1) {
          // Scenario A: Smart Patch
          const targetFile = context[0];
          const confirm = window.confirm(`¿Deseas actualizar "${targetFile.name}" con esta información?`);
          if (!confirm) return;

          const toastId = toast.loading("Cristalizando...");
          try {
              await callFunction('scribePatchFile', {
                  fileId: targetFile.id,
                  patchContent: cleanText,
                  accessToken: accessToken,
                  instructions: "Integra esta información en la sección más relevante o crea una nueva."
              });
              toast.success("Archivo actualizado correctamente.", { id: toastId });
          } catch (e: any) {
              console.error(e);
              toast.error("Error al actualizar archivo: " + (e.message || "Desconocido"), { id: toastId });
          }
      } else {
          // Scenario B: Create New
          const confirm = window.confirm(t.common.createFromChatConfirm);
          if (confirm) {
               const name = window.prompt(t.editor.enterFileName);
               if (!name) return;

               const toastId = toast.loading(t.common.creating);
               try {
                   await callFunction('scribeCreateFile', {
                       entityId: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                       entityData: { name: name, type: 'concept', tags: ['crystallized'] },
                       chatContent: cleanText,
                       folderId: folderId,
                       accessToken: accessToken
                   });
                   toast.success("Archivo creado.", { id: toastId });
               } catch (e: any) {
                   console.error(e);
                   toast.error("Error al crear archivo: " + (e.message || "Desconocido"), { id: toastId });
               }
          }
      }
  }, [accessToken, folderId, t]);

  const handleSendMessage = async (text: string, attachment: File | null = null) => {
    if ((!text.trim() && !attachment) || !activeGem) return;

    // 🟢 PREPARE ATTACHMENT
    let mediaAttachment = undefined;
    let previewUrl = undefined;
    if (attachment) {
         previewUrl = URL.createObjectURL(attachment);
         try {
             const part = await fileToGenerativePart(attachment);
             mediaAttachment = part.inlineData;
         } catch (e) {
             toast.error("Error al procesar el adjunto.");
             return;
         }
    }

    // 🟢 Capture context at the moment of sending
    const currentContext = [...attachedFiles];

    const userMessage: ExtendedChatMessage = {
        role: 'user',
        text,
        contextFiles: currentContext,
        attachmentPreview: previewUrl,
        attachmentType: attachment?.type.startsWith('audio') ? 'audio' : 'image'
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // 🟢 1. FETCH CONTENT FOR ATTACHED FILES (DRIVE CONTEXT)
      let enrichedFiles: any[] = [];
      if (attachedFiles.length > 0 && accessToken) {
          const promises = attachedFiles.map(async (file) => {
              try {
                  // Only fetch text-readable files
                  if (file.mimeType.includes('pdf') || file.mimeType.includes('image')) {
                      // Skip content fetching for now, or handle differently
                      return { name: file.name, content: "[Binary File - Skipped]" };
                  }

                  const data = await callFunction<{ content: string }>('getDriveFileContent', { fileId: file.id, accessToken });
                  return { name: file.name, content: data.content };
              } catch (e) {
                  console.error(`Failed to read ${file.name}`, e);
                  return { name: file.name, content: "Error reading file." };
              }
          });

          enrichedFiles = await Promise.all(promises);
      }

      // 🟢 2. SEND TO CHAT
      const data = await callFunction<any>('chatWithGem', {
        query: text,
        systemInstruction: activeGem.systemInstruction,
        history: messages.map(m => ({ role: m.role, message: m.text })),
        categoryFilter: categoryFilter,
        projectId: folderId || undefined,
        activeFileContent: activeFileContent || "",
        activeFileName: activeFileName || "",
        isFallbackContext: isFallbackContext,
        attachedFiles: enrichedFiles, // 👈 Pass Enriched Context
        mediaAttachment: mediaAttachment // 🟢 Pass Multimodal Attachment
      }, { timeout: 540000 });

      const aiMessage: ExtendedChatMessage = {
        role: 'model',
        text: data.response,
        sources: data.sources,
        contextFiles: currentContext // 🟢 Persist context in AI response too (for logic linkage)
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
          <div className="absolute inset-0 bg-emerald-500/20 z-50 flex items-center justify-center border-2 border-emerald-500 border-dashed backdrop-blur-sm pointer-events-none">
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
              <span className="font-bold text-titanium-100 tracking-wide">{displayGemName}</span>
            </>
          )}
          {!activeGem && <span className="text-titanium-500 text-sm">{t.common.selectTool}</span>}
        </div>
        <button
          onClick={onClose}
          className="text-titanium-500 hover:text-white transition-colors"
          aria-label="Cerrar chat"
        >
          <X size={20} />
        </button>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">
        {messages.length === 0 && !isLoading && emptyStateComponent ? (
            <div className="h-full flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                {emptyStateComponent}
            </div>
        ) : (
            <>
                {messages.map((msg, idx) => (
                  <ChatMessageItem key={idx} msg={msg} onCrystallize={handleCrystallize} />
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-titanium-900 rounded-2xl px-4 py-3 border border-titanium-800">
                        <Loader2 size={16} className="animate-spin text-titanium-500" />
                    </div>
                  </div>
                )}
            </>
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
                        <button onClick={() => removeAttachedFile(file.id)} className="hover:text-red-400" aria-label={`Quitar ${file.name}`}><X size={12}/></button>
                    </div>
                ))}
            </div>
        )}

        <div className="flex items-end gap-2">
            {/* 🟢 PORTAL BUTTON */}
            <button
                onClick={() => setIsContextModalOpen(true)}
                className="p-3 bg-titanium-900 border border-titanium-800 rounded-xl text-titanium-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all mb-[1px]"
                title="Abrir Portal de Contexto"
                aria-label="Abrir Portal de Contexto"
            >
                <Folder size={20} />
            </button>

            <ChatInput
                onSend={handleSendMessage}
                placeholder={activeGem ? `${t.common.writeTo} ${displayGemName}...` : t.common.selectTool}
                disabled={!activeGem}
                isLoading={isLoading}
                className="flex-1"
                textAreaClassName="bg-slate-800 text-white placeholder-gray-400"
            />
        </div>
      </div>

      {/* 🟢 CONTEXT MODAL */}
      <ContextSelectorModal
          isOpen={isContextModalOpen}
          onClose={() => setIsContextModalOpen(false)}
          onConfirm={(files) => {
              // Merge with existing avoiding duplicates
              setAttachedFiles(prev => {
                  const existingIds = new Set(prev.map(f => f.id));
                  const newFiles = files.filter(f => !existingIds.has(f.id));
                  return [...prev, ...newFiles];
              });
              setIsContextModalOpen(false);
          }}
          initialSelection={attachedFiles.map(f => f.id)}
      />
    </div>
  );
};

export default ChatPanel;