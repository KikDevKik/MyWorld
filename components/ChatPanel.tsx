import React, { useState, useRef, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import type { ChatMessage, GemId, Gem } from '../types';
import { GEMS } from '../constants';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface ChatPanelProps {
  activeGemId: GemId | null;
  initialMessage?: string | null;
  onMessageSent?: () => void;
  isOpen: boolean;
  onClose: () => void;
  isFullWidth?: boolean;
  categoryFilter?: 'canon' | 'reference'; // 👈 New prop
  customGem?: Gem; // 👈 New prop for virtual gems
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
  customGem
}) => {
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 🟢 DETERMINE ACTIVE GEM (Custom > Predefined)
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

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !activeGem) return;

    const userMessage: ExtendedChatMessage = { role: 'user', text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const functions = getFunctions();
      // 🟢 CORRECT FUNCTION CALL
      const chatWithGem = httpsCallable(functions, 'chatWithGem');

      const result = await chatWithGem({
        query: text, // 👈 Renamed to query to match backend
        systemInstruction: activeGem.systemInstruction, // 👈 Send instruction
        history: messages.map(m => ({ role: m.role, message: m.text })), // 👈 Map to expected format
        categoryFilter: categoryFilter // 👈 Send filter
      });

      const data = result.data as any;
      const aiMessage: ExtendedChatMessage = {
        role: 'model',
        text: data.response,
        sources: data.sources
      };

      setMessages(prev => [...prev, aiMessage]);
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

  // 🟢 LOGIC FOR STYLING
  const baseClasses = "bg-titanium-950 border-l border-titanium-700 flex flex-col shadow-2xl transition-all duration-300 z-40";
  // Fixed: Side panel mode
  const fixedClasses = `fixed top-0 bottom-0 right-16 w-[400px] transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`;
  // Full Width: Main stage mode
  const fullWidthClasses = "w-full h-full border-none";

  return (
    <div className={`${baseClasses} ${isFullWidth ? fullWidthClasses : fixedClasses}`}>

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
        <button onClick={onClose} className="text-titanium-500 hover:text-white transition-colors">
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

            {/* SOURCES (RAG) */}
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
            <div className="bg-titanium-900 rounded-2xl rounded-bl-none px-4 py-3 border border-titanium-800">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="p-4 border-t border-titanium-800 bg-titanium-900/30">
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
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent-DEFAULT focus:ring-2 focus:ring-accent-DEFAULT/50 transition-all resize-none h-[52px] max-h-[150px] overflow-y-auto scrollbar-hide"
          />
          <button
            onClick={() => handleSendMessage(input)}
            disabled={!input.trim() || !activeGem || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-titanium-800 text-titanium-400 rounded-lg hover:bg-titanium-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div className="text-[10px] text-center mt-2 text-titanium-600">
          Presiona Enter para enviar • Shift + Enter para nueva línea
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;