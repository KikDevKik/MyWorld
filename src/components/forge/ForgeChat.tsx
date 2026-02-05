import React, { useState, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';
import { Send, Loader2, Bot, User, Hammer, RefreshCcw, Shield, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import MarkdownRenderer from '../ui/MarkdownRenderer';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { SoulEntity } from '../../types/forge';
import { CreativeAuditService } from '../../services/CreativeAuditService';
import { callFunction } from '../../services/api';
import ChatInput from '../ui/ChatInput';
import { fileToGenerativePart } from '../../services/geminiService';

interface Message {
    id?: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: string;
    sources?: string[];
    hidden?: boolean; // 🟢 Control UI visibility
    attachmentPreview?: string;
    attachmentType?: 'image' | 'audio';
}

interface ForgeChatProps {
    sessionId: string;
    sessionName: string;
    onBack: () => void; // Kept for compatibility, though maybe unused in split view
    folderId: string;
    accessToken: string | null;
    characterContext?: string;

    // 🟢 HOT-SWAPPING PROPS
    activeEntity: SoulEntity | null;
    selectedScope: { id: string | null; name: string; recursiveIds: string[]; path?: string };

    // Legacy props kept just in case, but intended to be unused
    activeContextFile?: { id: string, name: string, content: string };
    onReset?: () => void;
}

type ThinkingState = 'IDLE' | 'THINKING' | 'CONSULTING_ARCHIVES' | 'ERROR' | 'ANALYZING';

const ForgeChat: React.FC<ForgeChatProps> = ({
    sessionId,
    sessionName,
    onBack,
    folderId,
    accessToken,
    characterContext,
    activeEntity,
    selectedScope,
    activeContextFile
}) => {
    const { config, user } = useProjectConfig();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false); // Initial load
    const [isSending, setIsSending] = useState(false);
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // 🟢 PREVIEW MODE (Anchors)
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // 🟢 STREAMING STATE
    const [thinkingState, setThinkingState] = useState<ThinkingState>('IDLE');
    const [streamStatus, setStreamStatus] = useState<string>('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const activeEntityRef = useRef<string | null>(null); // To track changes

    // SCROLL TO BOTTOM
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, thinkingState]);

    // --- 1. SESSION MANAGEMENT (Load History) ---
    useEffect(() => {
        let ignore = false;

        const loadHistory = async () => {
            // If we just swapped entities, we might want to skip loading old history
            // because we are about to wipe it. But for "refresh" persistence, we load it.
            // If activeEntity just changed, the separate useEffect will handle the wipe.

            setIsLoading(true);

            try {
                const loaded = await callFunction<Message[]>('getForgeHistory', { sessionId });
                if (!ignore) {
                    setMessages(loaded);
                }
            } catch (error) {
                console.warn("History load failed:", error);
            } finally {
                if (!ignore) setIsLoading(false);
            }
        };

        if (sessionId) {
            loadHistory();
        }

        return () => { ignore = true; };
    }, [sessionId]);

    // --- 2. CORE SEND LOGIC ---
    const executeStreamConnection = async (text: string, options: { hidden: boolean, attachment?: File | null }) => {
        if (isSending) return;

        // 🟢 PREPARE ATTACHMENT
        let mediaAttachment = undefined;
        let previewUrl = undefined;
        if (options.attachment) {
             previewUrl = URL.createObjectURL(options.attachment);
             try {
                 const part = await fileToGenerativePart(options.attachment);
                 mediaAttachment = part.inlineData;
             } catch (e) {
                 toast.error("Error al procesar el adjunto.");
                 return;
             }
        }

        setIsSending(true);
        // If hidden (Injection), set state to ANALYZING to show special loader
        setThinkingState(options.hidden ? 'ANALYZING' : 'THINKING');
        setStreamStatus(options.hidden ? `Analizando expediente de ${activeEntity?.name}...` : 'Pensando...');

        // 1. Optimistic Update & Local State
        const tempUserMsg: Message = {
            role: 'user',
            text: text,
            hidden: options.hidden,
            attachmentPreview: previewUrl,
            attachmentType: options.attachment?.type.startsWith('audio') ? 'audio' : 'image'
        };

        // We add it to local state so it is sent as history context in the stream request
        setMessages(prev => [...prev, tempUserMsg]);

        // 2. Persist User Message (ONLY IF NOT HIDDEN)
        // Hidden messages are ephemeral context for the AI, not chat log material.

        if (!options.hidden) {
            callFunction('addForgeMessage', { sessionId, role: 'user', text: text }).catch(e =>
                console.error("Failed to save user message", e)
            );

            // ⚖️ AUDIT: THE SEED (Prompt Injection)
            if (user && folderId) {
                CreativeAuditService.logCreativeEvent({
                    projectId: folderId,
                    userId: user.uid,
                    component: 'ForgeChat',
                    actionType: 'INJECTION',
                    description: 'User sent narrative prompt',
                    payload: {
                        promptContent: text, // Capture "The Seed"
                        promptLength: text.length,
                        sessionId: sessionId,
                        scope: selectedScope.name,
                        hasAttachment: !!options.attachment
                    }
                });
            }
        }

        // 3. Prepare History
        let historyContext = [...messages, tempUserMsg].map(m => ({
            role: m.role,
            message: m.text
        }));

        // 4. Stream Setup
        const app = getApp();
        const projectId = app.options.projectId;
        const region = 'us-central1';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        let functionUrl = `https://${region}-${projectId}.cloudfunctions.net/forgeChatStream`;
        if (isLocal) {
            functionUrl = `http://127.0.0.1:5001/${projectId}/${region}/forgeChatStream`;
        }

        try {
            const auth = getAuth();
            const idToken = await auth.currentUser?.getIdToken();

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    query: text,
                    history: historyContext,
                    folderId: folderId,
                    filterScopePath: selectedScope.path,
                    activeFileName: activeContextFile?.name,
                    mediaAttachment: mediaAttachment
                })
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // Add placeholder for AI response
            const aiMsgId = `ai-${Date.now()}`;
            setMessages(prev => [...prev, { role: 'model', text: '', id: aiMsgId, sources: [] }]);

            let accumulatedText = "";
            let accumulatedSources: string[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'text') {
                            accumulatedText += data.content;
                            setMessages(prev => prev.map(m =>
                                m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                            ));
                            setThinkingState('IDLE');
                        } else if (data.type === 'tool_start') {
                            // If we were ANALYZING, switch to CONSULTING to show progress
                            setThinkingState('CONSULTING_ARCHIVES');
                            if (data.tool === 'consult_archives') {
                                setStreamStatus(`Consultando Archivos: "${data.query}"...`);
                            }
                        } else if (data.type === 'tool_end') {
                            setThinkingState('IDLE');
                            if (data.sources) {
                                accumulatedSources = [...accumulatedSources, ...data.sources];
                                accumulatedSources = Array.from(new Set(accumulatedSources));
                                setMessages(prev => prev.map(m =>
                                    m.id === aiMsgId ? { ...m, sources: accumulatedSources } : m
                                ));
                            }
                        }
                    } catch (err) { /* JSON Parse Error (Partial chunk) */ }
                }
            }

            // 5. Persist AI Response (Always)
            if (accumulatedText) {
                await callFunction('addForgeMessage', {
                    sessionId,
                    role: 'model',
                    text: accumulatedText,
                    sources: accumulatedSources
                });
            }

        } catch (error: any) {
            console.error("Stream failed:", error);
            setThinkingState('ERROR');
            toast.error("Error de conexión con la Forja.");
            const errorText = "⚠️ Error de Conexión.";
            setMessages(prev => [...prev, { role: 'model', text: errorText }]);
        } finally {
            setIsSending(false);
            setThinkingState('IDLE');
        }
    };

    const triggerAnalysis = (entity: SoulEntity) => {
        // B. CONSTRUCT PROMPT (THE BRAIN)
        const commonFooter = `
IMPORTANT: You are acting as an expert narrative analyst.
MANDATORY: You MUST use the 'consult_archives' tool with the query "${entity.name}" to retrieve the full context from the TDB Index before answering. Do not rely solely on the provided snippet.
        `;

        let systemPrompt = "";

        if (entity.tier === 'GHOST') {
            systemPrompt = `
[MODO: DETECTIVE NARRATIVO]
OBJETIVO: Extrapolar la identidad de una entidad detectada.

DATOS:
- Nombre: ${entity.name}
- Contexto Detectado: "${entity.sourceSnippet}"
- Ocurrencias: ${entity.occurrences}

INSTRUCCIÓN:
Analiza el snippet y lo que encuentres en los archivos. ¿Quién es este personaje? ¿Qué papel juega?
Empieza con: "He rastreado a ${entity.name}..." y termina con una pregunta clave sobre su futuro.
            `;
        } else if (entity.tier === 'LIMBO') {
            systemPrompt = `
[MODO: EDITOR / CO-AUTOR]
OBJETIVO: Convertir un borrador en un personaje sólido.

DATOS:
- Nombre: ${entity.name}
- Notas Crudas: "${entity.sourceSnippet}"
- Rasgos: ${entity.tags?.join(', ') || "No definidos"}

INSTRUCCIÓN:
Estas son mis notas desordenadas. Organízalas mentalmente (usando los archivos) y preséntame un resumen profesional.
Propón 3 arquetipos posibles para este personaje.
            `;
        } else {
            // ANCHOR
            systemPrompt = `
[MODO: PSICÓLOGO DE PERSONAJES]
OBJETIVO: Profundizar en la psique de un personaje existente.

DATOS:
- Nombre: ${entity.name}
- Rol: ${entity.role || "No definido"}
- Descripción/Snippet: "${entity.sourceSnippet}"

INSTRUCCIÓN:
Ya conocemos a ${entity.name}. No me des un resumen básico.
Busca en los archivos sus interacciones más recientes o traumas.
Hazme una pregunta provocadora sobre su motivación oculta.
            `;
        }

        // C. INJECT
        executeStreamConnection(`${systemPrompt}\n${commonFooter}`, { hidden: true });
    };

    // --- 3. HOT-SWAPPING LOGIC (The "Vitamin") ---
    useEffect(() => {
        if (!activeEntity) return;
        if (activeEntity.id === activeEntityRef.current) return;

        console.log(`[FORGE_CHAT] Hot-Swapping to: ${activeEntity.name} (${activeEntity.tier})`);

        // A. RESET
        activeEntityRef.current = activeEntity.id;
        setMessages([]); // Wipe Amnesia
        setIsLoading(false); // Stop loading spinner if history was fetching
        setIsPreviewMode(false);
        setPreviewContent(null);

        // B. DECIDE MODE
        if (activeEntity.tier === 'ANCHOR') {
            // 🟢 PREVIEW MODE
            setIsPreviewMode(true);
            const fetchPreview = async () => {
                setIsPreviewLoading(true);
                try {
                    if (activeEntity.driveId && accessToken) {
                         const data = await callFunction<{ content: string }>('getDriveFileContent', {
                             fileId: activeEntity.driveId,
                             accessToken
                         });
                         setPreviewContent(data.content);
                    } else {
                        setPreviewContent("⚠️ No se pudo cargar la vista previa (Falta ID o Acceso).");
                    }
                } catch (error) {
                    console.error("Preview fetch failed:", error);
                    setPreviewContent("⚠️ Error al cargar el expediente.");
                } finally {
                    setIsPreviewLoading(false);
                }
            };
            fetchPreview();
        } else {
            // 🟢 DIRECT CHAT MODE (Ghost/Limbo)
            triggerAnalysis(activeEntity);
        }

    }, [activeEntity]); // Dependency on activeEntity object

    const handleStartAnchorAnalysis = () => {
        setIsPreviewMode(false);
        if (activeEntity) {
            triggerAnalysis(activeEntity);
        }
    };


    // --- HANDLERS ---
    const handlePurgeSession = async () => {
        if (!window.confirm("¿Borrar chat actual?")) return;
        setMessages([]);
        await callFunction('clearSessionMessages', { sessionId });
    };

    const handleCrystallize = async () => {
        if (!activeEntity) return;

        // 1. Vault Validation
        // If config is loading, we might block? For now assuming loaded.
        // We use config.characterVaultId OR folderId if config missing (fallback)
        const vaultId = config?.characterVaultId || folderId;

        if (!vaultId) {
            toast.error("No se encontró la Bóveda de Personajes.");
            return;
        }

        if (!accessToken) {
            toast.error("Sesión de Drive expirada.");
            return;
        }

        setIsCrystallizing(true);
        const toastId = toast.loading("Forjando Archivo de Alma...");

        try {
            // Gather Intelligence
            const lastAiMsg = messages.filter(m => m.role === 'model' && !m.hidden).pop();
            const chatNotes = lastAiMsg ? lastAiMsg.text : "Sin notas de sesión.";

            await callFunction('scribeCreateFile', {
                entityId: activeEntity.id,
                entityData: {
                    name: activeEntity.name,
                    role: activeEntity.role,
                    type: 'character',
                    aliases: activeEntity.aliases || [],
                    tags: activeEntity.tags,
                    summary: activeEntity.sourceSnippet
                },
                chatContent: chatNotes,
                folderId: vaultId,
                accessToken: accessToken,
                sagaId: selectedScope.id
            });

            toast.success(`¡${activeEntity.name} ha sido Documentado por El Escriba!`, { id: toastId });
            onBack(); // Close chat on success

        } catch (error) {
            console.error(error);
            toast.error("Error en la materialización.", { id: toastId });
        } finally {
            setIsCrystallizing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-titanium-950">
            {/* HEADER */}
            <div className="h-16 flex items-center gap-4 px-6 pr-16 border-b border-titanium-800 bg-titanium-900 shrink-0">
                <div>
                    <h2 className="font-bold text-titanium-100 truncate max-w-[300px]">{sessionName}</h2>
                    <p className="text-[10px] text-titanium-400 uppercase tracking-wider flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${activeEntity ? 'bg-accent-DEFAULT' : 'bg-green-500'}`}></span>
                        {activeEntity ? `Enfoque: ${activeEntity.tier}` : 'Sesión Activa'}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={handlePurgeSession} className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-red-400" title="Limpiar Chat">
                        <RefreshCcw size={20} />
                    </button>

                    {/* CRYSTALLIZE BUTTON */}
                    <button
                        onClick={handleCrystallize}
                        disabled={isCrystallizing || !activeEntity}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                            isCrystallizing || !activeEntity
                            ? "bg-titanium-800 text-titanium-500 cursor-not-allowed border border-titanium-700"
                            : "border border-accent-DEFAULT text-accent-DEFAULT bg-accent-900/10 hover:bg-accent-DEFAULT hover:text-black shadow-[0_0_10px_rgba(255,215,0,0.1)] hover:shadow-[0_0_20px_rgba(255,215,0,0.4)]"
                        }`}
                    >
                        {isCrystallizing ? (
                            <><Loader2 size={12} className="animate-spin" /> Forjando...</>
                        ) : (
                            <><Hammer size={12} /> Cristalizar</>
                        )}
                    </button>
                </div>
            </div>

            {/* 🟢 PREVIEW OR MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {isPreviewMode ? (
                    <div className="h-full flex flex-col max-w-4xl mx-auto">
                        <div className="flex items-center gap-3 text-titanium-400 mb-6 px-4">
                             <FileText size={18} className="text-emerald-500" />
                             <h3 className="text-sm font-bold uppercase tracking-wider">Vista Previa del Expediente</h3>
                        </div>

                        {isPreviewLoading ? (
                             <div className="flex-1 flex flex-col items-center justify-center text-titanium-500">
                                <Loader2 size={32} className="animate-spin mb-4 text-emerald-500" />
                                <p className="text-sm animate-pulse">Desencriptando archivo...</p>
                             </div>
                        ) : (
                            <div className="flex-1 bg-titanium-900/50 rounded-2xl border border-titanium-800 p-6 md:p-8 overflow-y-auto shadow-inner relative">
                                <div className="prose prose-invert prose-emerald max-w-none">
                                    <MarkdownRenderer content={previewContent || "_Documento vacío_"} mode="full" />
                                </div>
                                {/* 🟢 FLOATING ACTION BUTTON */}
                                <div className="sticky bottom-0 flex justify-center pt-8 pb-2 bg-gradient-to-t from-titanium-900/90 via-titanium-900/80 to-transparent">
                                     <button
                                         onClick={handleStartAnchorAnalysis}
                                         className="group flex items-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full shadow-lg shadow-emerald-900/20 transition-all hover:scale-105 active:scale-95"
                                     >
                                         <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />
                                         <span>Mejorar o Actualizar</span>
                                         <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                     </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* NORMAL CHAT MESSAGES */
                    <>
                        {isLoading && messages.length === 0 ? (
                            <div className="flex justify-center py-8 text-titanium-500">
                                <Loader2 size={24} className="animate-spin" />
                            </div>
                        ) : messages.filter(m => !m.hidden).length === 0 && thinkingState === 'IDLE' ? (
                            <div className="text-center py-20 text-titanium-600">
                                <Bot size={48} className="mx-auto mb-4 opacity-20" />
                                <p className="text-sm font-medium">Esperando órdenes...</p>
                            </div>
                        ) : (
                            messages.filter(m => !m.hidden).map((msg, idx) => (
                                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start max-w-3xl'}`}>
                                    {msg.role === 'model' && (
                                        <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                                            <Bot size={16} className="text-accent-DEFAULT" />
                                        </div>
                                    )}

                                    <div className={`flex-1 flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        {/* 🟢 ATTACHMENT PREVIEW */}
                                        {msg.attachmentPreview && (
                                            <div className="mb-1 rounded-lg overflow-hidden border border-white/10 max-w-sm">
                                                {msg.attachmentType === 'audio' ? (
                                                    <audio controls src={msg.attachmentPreview} className="w-full" />
                                                ) : (
                                                    <img src={msg.attachmentPreview} alt="Attachment" className="max-w-full h-auto object-cover" />
                                                )}
                                            </div>
                                        )}

                                        <div className={`p-4 rounded-xl text-sm leading-relaxed shadow-sm overflow-hidden break-words whitespace-pre-wrap ${msg.role === 'user'
                                                ? 'bg-titanium-800 text-titanium-100 border border-titanium-700'
                                                : 'bg-transparent text-titanium-300 w-full'
                                                }`}>
                                            <MarkdownRenderer content={msg.text} mode="full" />
                                        </div>

                                        {msg.role === 'model' && msg.sources && msg.sources.length > 0 && (
                                            <div className="flex flex-wrap gap-2 px-1">
                                                {msg.sources.map((src, i) => (
                                                    <div key={i} className="text-[10px] font-mono text-titanium-500 bg-titanium-900 border border-titanium-800 px-2 py-0.5 rounded flex items-center gap-1 opacity-70">
                                                        <span>📄</span>
                                                        <span className="truncate max-w-[200px]">{src}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}

                        {/* THINKING INDICATOR */}
                        {thinkingState !== 'IDLE' && (
                            <div className="flex gap-4 justify-start max-w-3xl">
                                <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                                    <Bot size={16} className="text-accent-DEFAULT" />
                                </div>
                                <div className={`p-4 rounded-xl border text-xs font-mono flex items-center gap-3 animate-pulse ${
                                    thinkingState === 'ANALYZING'
                                        ? 'bg-accent-900/10 border-accent-500/20 text-accent-300'
                                        : 'bg-titanium-900/50 border-cyan-500/20 text-cyan-300'
                                }`}>
                                    {thinkingState === 'CONSULTING_ARCHIVES' ? (
                                        <>
                                            <Sparkles size={14} className="animate-spin-slow" />
                                            <span>{streamStatus}</span>
                                        </>
                                    ) : thinkingState === 'ANALYZING' ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>{streamStatus}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>THINKING...</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* INPUT AREA */}
            <div className={`p-4 md:p-6 border-t border-titanium-800 bg-titanium-900/90 backdrop-blur shrink-0 z-50 ${isPreviewMode ? 'hidden' : ''}`}>
                <div className="max-w-4xl mx-auto flex flex-col gap-3">

                    {/* META CONTROLS */}
                    <div className="flex items-center justify-between px-1">
                         <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                selectedScope.id
                                ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-300'
                                : 'bg-titanium-800 border-titanium-700 text-titanium-500'
                            }`}>
                            <Shield size={12} />
                            <span>Scope: {selectedScope.name}</span>
                         </div>
                    </div>

                    {/* TEXTAREA WRAPPER */}
                    <div className={`rounded-2xl p-1 transition-all shadow-lg ${
                         selectedScope.id
                                ? 'border border-cyan-900/50 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/50 bg-zinc-900'
                                : 'border border-titanium-700 focus-within:border-accent-DEFAULT focus-within:ring-1 focus-within:ring-accent-DEFAULT/50 bg-zinc-900'
                    }`}>
                        <ChatInput
                            onSend={(text, attachment) => executeStreamConnection(text, { hidden: false, attachment: attachment })}
                            placeholder={activeEntity ? `Interrogar a ${activeEntity.name}...` : "Escribe a la Forja..."}
                            disabled={isSending || thinkingState === 'ANALYZING'}
                            autoFocus
                            className="w-full"
                            textAreaClassName="bg-transparent text-sm text-zinc-200 placeholder-titanium-500"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgeChat;
