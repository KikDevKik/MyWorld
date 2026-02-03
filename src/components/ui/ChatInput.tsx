import React, { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { Send, Paperclip, X, Image as ImageIcon, Music, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface ChatInputProps {
    onSend: (text: string, attachment: File | null) => void;
    placeholder?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    className?: string;
    textAreaClassName?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
    onSend,
    placeholder = "Escribe un mensaje...",
    disabled = false,
    autoFocus = false,
    className = "",
    textAreaClassName = ""
}) => {
    const [text, setText] = useState("");
    const [attachment, setAttachment] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [text]);

    // Cleanup preview URL
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleFileSelect = (file: File) => {
        // Validate types
        if (!file.type.startsWith('image/') && !file.type.startsWith('audio/')) {
            toast.error("Solo se permiten imágenes y audio.");
            return;
        }

        if (attachment) {
            toast.error("Solo un archivo por mensaje.");
            return;
        }

        setAttachment(file);

        if (file.type.startsWith('image/')) {
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setPreviewUrl(null);
        }
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
        // Reset input so same file can be selected again if needed (though we limit to 1)
        e.target.value = "";
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
            return;
        }
        setIsDragging(false);
    };

    const handleRemoveAttachment = () => {
        setAttachment(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!text.trim() && !attachment) return;

        onSend(text, attachment);
        setText("");
        setAttachment(null);
        setPreviewUrl(null);

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit();
        }
    };

    return (
        <div
            className={`relative flex flex-col gap-2 ${className}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-emerald-500/20 border-2 border-emerald-500 border-dashed rounded-lg flex items-center justify-center backdrop-blur-sm pointer-events-none">
                    <div className="text-emerald-400 font-bold flex items-center gap-2">
                        <Paperclip size={20} />
                        <span>Soltar para adjuntar</span>
                    </div>
                </div>
            )}

            {/* Attachment Preview */}
            {attachment && (
                <div className="flex items-center gap-3 bg-titanium-900/80 border border-titanium-700 p-2 rounded-lg animate-in fade-in slide-in-from-bottom-2 self-start max-w-full">
                    <div className="relative group shrink-0">
                        {previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="w-12 h-12 object-cover rounded bg-black/50" />
                        ) : (
                            <div className="w-12 h-12 flex items-center justify-center bg-titanium-800 rounded text-pink-400">
                                <Music size={20} />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                            <ImageIcon size={16} className="text-white" />
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-titanium-200 truncate max-w-[200px] font-medium">{attachment.name}</p>
                        <p className="text-[10px] text-titanium-500 uppercase">{attachment.type.split('/')[1]}</p>
                    </div>

                    <button
                        onClick={handleRemoveAttachment}
                        className="p-1 hover:bg-red-500/20 text-titanium-400 hover:text-red-400 rounded-full transition-colors"
                        title="Quitar archivo"
                        aria-label="Quitar archivo adjunto"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Input Bar */}
            <div className={`flex items-end gap-2 bg-titanium-950 border border-titanium-800 rounded-xl px-2 py-2 focus-within:border-emerald-500/50 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>

                {/* File Button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!attachment || disabled}
                    className={`p-2 rounded-lg transition-colors mb-0.5 shrink-0 ${
                        attachment
                        ? 'text-emerald-500 bg-emerald-500/10'
                        : 'text-titanium-400 hover:text-emerald-400 hover:bg-titanium-800'
                    }`}
                    title="Adjuntar imagen o audio"
                    aria-label="Adjuntar imagen o audio"
                >
                    <Paperclip size={20} />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,audio/*"
                    onChange={handleInputChange}
                />

                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    rows={1}
                    className={`flex-1 bg-transparent text-sm text-titanium-100 placeholder-titanium-500 focus:outline-none py-2.5 max-h-[150px] resize-none scrollbar-hide ${textAreaClassName}`}
                />

                <button
                    onClick={() => handleSubmit()}
                    disabled={(!text.trim() && !attachment) || disabled}
                    className="p-2 bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-800 text-emerald-400 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-0.5 shrink-0"
                    aria-label="Enviar mensaje"
                >
                    <Send size={20} />
                </button>
            </div>
        </div>
    );
};

export default ChatInput;
