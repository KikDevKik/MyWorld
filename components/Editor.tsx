import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { getFunctions, httpsCallable } from "firebase/functions";
import { Save, Loader2, CheckCircle, AlertCircle, FileText, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { marked } from 'marked';
import TurndownService from 'turndown';
import BubbleMenu from './BubbleMenu';
import StatusBar from './StatusBar';
import ReadingToolbar from './ReadingToolbar';

interface EditorProps {
    fileId: string | null;
    content: string;
    onBubbleAction?: (action: string, text: string) => void;
    accessToken: string | null;
    fileName?: string;
    onTokenExpired: () => void;
    onFocusChange?: (isFocused: boolean) => void;
    isZenMode: boolean;
    setIsZenMode: (isZen: boolean) => void;
}

const Editor: React.FC<EditorProps> = ({
    fileId, content, onBubbleAction, accessToken, fileName, onTokenExpired, onFocusChange,
    isZenMode, setIsZenMode
}) => {
    // 🟢 VISUAL STATE
    const [fontFamily, setFontFamily] = useState<'serif' | 'sans'>('serif');
    const [editorWidth, setEditorWidth] = useState<'narrow' | 'wide'>('narrow');
    const [showScrollTop, setShowScrollTop] = useState(false);

    // 🟢 EDITOR STATE
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // 🟢 REFS
    const zenContainerRef = useRef<HTMLDivElement>(null);
    const editorContentRef = useRef<HTMLDivElement>(null);

    // 🟢 BUBBLE MENU STATE
    const [bubbleMenuProps, setBubbleMenuProps] = useState({
        visible: false,
        x: 0,
        y: 0
    });

    // 🟢 MARKDOWN CONVERSION SERVICES
    const turndownService = useMemo(() => {
        const service = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });
        return service;
    }, []);

    // 🟢 TIPTAP EDITOR
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
        ],
        editorProps: {
            attributes: {
                class: [
                    'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-300px)]',
                    'transition-all duration-300',
                    // TYPOGRAPHY RESET & SPACING (más agresivo)
                    '[&_p]:mb-6 [&_p]:mt-0',  // Selector directo para párrafos
                    'prose-p:mb-6 prose-p:mt-0 prose-p:leading-relaxed',
                    'prose-headings:mb-4 prose-headings:mt-8 prose-headings:font-bold',
                    'prose-h1:text-4xl prose-h1:leading-tight',
                    'prose-h2:text-3xl prose-h2:leading-snug',
                    'prose-h3:text-2xl',
                    'prose-blockquote:my-6 prose-blockquote:pl-4',
                    'prose-ul:my-6 prose-ol:my-6 prose-li:my-2',
                    '[&_*]:first:mt-0',  // Primer elemento sin margin-top
                    // COLORS (Dark Mode)
                    'prose-headings:text-titanium-100',
                    'prose-p:text-titanium-100',
                    'prose-strong:text-white prose-strong:font-semibold',
                    'prose-em:text-titanium-200',
                    'prose-blockquote:border-l-accent-DEFAULT prose-blockquote:text-titanium-400 prose-blockquote:italic',
                    'prose-code:text-accent-DEFAULT prose-code:bg-titanium-900',
                    // DYNAMIC FONT FAMILY
                    fontFamily === 'serif'
                        ? 'font-serif prose-headings:font-serif prose-p:font-serif prose-p:text-lg prose-p:leading-loose'
                        : 'font-sans prose-headings:font-sans prose-p:font-sans prose-p:text-base prose-p:leading-relaxed'
                ].join(' '),
            },
        },
        onFocus: () => onFocusChange?.(true),
        onBlur: () => onFocusChange?.(false),
        onSelectionUpdate: ({ editor }) => {
            const { empty } = editor.state.selection;

            if (empty) {
                setBubbleMenuProps(prev => ({ ...prev, visible: false }));
                return;
            }

            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
                const range = domSelection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                if (rect.width > 0) {
                    setBubbleMenuProps({
                        visible: true,
                        x: rect.left + (rect.width / 2),
                        y: rect.top
                    });
                }
            }
        }
    });

    // 🟢 SCROLL DETECTION
    useEffect(() => {
        const handleScroll = () => {
            const container = zenContainerRef.current;
            if (container) {
                setShowScrollTop(container.scrollTop > 300);
            }
        };

        const container = zenContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [isZenMode]);

    // 🟢 LOAD CONTENT (MARKDOWN -> HTML)
    useEffect(() => {
        if (editor && content) {
            const parseMarkdown = async () => {
                const html = await marked.parse(content);
                editor.commands.setContent(html);
            };
            parseMarkdown();
        }
    }, [content, editor, fileId]);

    // 🟢 SAVE CONTENT (HTML -> MARKDOWN)
    const handleSave = async () => {
        if (!fileId || !editor) return;

        setIsSaving(true);
        setSaveStatus('idle');

        try {
            const html = editor.getHTML();
            const markdown = turndownService.turndown(html);

            const functions = getFunctions();
            const saveDriveFile = httpsCallable(functions, 'saveDriveFile');

            await saveDriveFile({
                fileId: fileId,
                content: markdown,
                accessToken
            });

            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2000);
            toast.success("Cambios guardados");

        } catch (error: any) {
            console.error("Error saving:", error);
            setSaveStatus('error');

            if (error.message?.includes('unauthenticated') || error.code === 'functions/unauthenticated') {
                toast.error("Sesión caducada", {
                    action: {
                        label: "Renovar",
                        onClick: onTokenExpired
                    }
                });
            } else {
                toast.error("Error al guardar cambios");
            }
        } finally {
            setIsSaving(false);
        }
    };

    // Keyboard Shortcut for Save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            // ESC para salir del Zen Mode
            if (e.key === 'Escape' && isZenMode) {
                setIsZenMode(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave, isZenMode, setIsZenMode]);

    // 🟢 HANDLE BUBBLE MENU ACTIONS
    const handleMenuAction = (action: string) => {
        if (!editor || !onBubbleAction) return;

        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, ' ');

        onBubbleAction(action, text);
        setBubbleMenuProps(prev => ({ ...prev, visible: false }));
    };

    // 🟢 CLICK OUTSIDE HANDLER (Zen Mode)
    const handleZenBackgroundClick = (e: React.MouseEvent) => {
        // Solo cerrar si se hace clic en el fondo oscuro (no en el contenido)
        if (e.target === e.currentTarget) {
            setIsZenMode(false);
        }
    };

    // 🟢 SCROLL TO TOP
    const scrollToTop = () => {
        zenContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!fileId) {
        return (
            <div className="flex items-center justify-center h-full text-titanium-500">
                <p className="text-sm">Selecciona un archivo del Manual de Campo para editar.</p>
            </div>
        );
    }

    return (
        <div
            ref={zenContainerRef}
            className={`
                flex flex-col relative transition-all duration-500
                ${isZenMode ? 'fixed inset-0 z-50 bg-titanium-950 overflow-y-auto' : 'h-full'}
            `}
            onClick={isZenMode ? handleZenBackgroundClick : undefined}
        >

            {/* 🟢 TOP BAR (READING TOOLBAR + META) */}
            <div className={`
                sticky top-0 z-40 px-8 py-4 flex items-center justify-between
                transition-all duration-500
                ${isZenMode ? 'bg-transparent hover:bg-titanium-950/80' : 'bg-titanium-950/95 backdrop-blur-sm border-b border-titanium-800'}
            `}>
                {/* LEFT: FILE INFO */}
                <div className={`flex items-center gap-3 text-titanium-300 transition-opacity ${isZenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                    <FileText size={16} className="text-titanium-500" />
                    <span className="text-sm font-medium">{fileName || 'Documento'}</span>
                </div>

                {/* CENTER: READING TOOLBAR */}
                <div className="absolute left-1/2 transform -translate-x-1/2">
                    <ReadingToolbar
                        fontFamily={fontFamily}
                        setFontFamily={setFontFamily}
                        editorWidth={editorWidth}
                        setEditorWidth={setEditorWidth}
                        isZenMode={isZenMode}
                        setIsZenMode={setIsZenMode}
                    />
                </div>

                {/* RIGHT: SAVE BUTTON */}
                <div className={`transition-opacity ${isZenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg shadow-md transition-all duration-300
                            ${saveStatus === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900/50' :
                                saveStatus === 'error' ? 'bg-red-900/20 text-red-400 border border-red-900/50' :
                                    'bg-titanium-800 text-titanium-300 border border-titanium-700 hover:border-accent-DEFAULT hover:text-accent-DEFAULT'}
                        `}
                    >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> :
                            saveStatus === 'success' ? <CheckCircle size={14} /> :
                                saveStatus === 'error' ? <AlertCircle size={14} /> :
                                    <Save size={14} />}
                        <span className="text-xs font-medium">
                            {isSaving ? 'Guardando...' :
                                saveStatus === 'success' ? 'Guardado' :
                                    saveStatus === 'error' ? 'Error' :
                                        'Guardar'}
                        </span>
                    </button>
                </div>
            </div>

            {/* 🟢 MAIN EDITOR AREA */}
            <div
                ref={editorContentRef}
                className={`
                    flex-1 scrollbar-hide
                    ${isZenMode ? 'px-0' : 'px-4 overflow-y-auto'}
                `}
                onClick={(e) => e.stopPropagation()} // Evita cerrar Zen al hacer clic en el texto
            >
                <div className={`
                    mx-auto transition-all duration-500 min-h-screen
                    ${editorWidth === 'narrow' ? 'max-w-3xl' : 'max-w-5xl'}
                    py-16 px-12
                `}>
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* 🟢 SCROLL TO TOP BUTTON */}
            {isZenMode && showScrollTop && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-8 right-8 p-4 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 hover:text-white rounded-full shadow-2xl transition-all duration-300 z-50 border border-titanium-700"
                    title="Volver arriba"
                >
                    <ArrowUp size={20} />
                </button>
            )}

            {/* 🟢 BUBBLE MENU */}
            <BubbleMenu
                visible={bubbleMenuProps.visible}
                x={bubbleMenuProps.x}
                y={bubbleMenuProps.y}
                onAction={handleMenuAction}
                editor={editor}
            />

            {/* 🟢 STATUS BAR */}
            <div className={`
                transition-all duration-500
                ${isZenMode ? 'fixed bottom-0 left-0 right-0 z-50 opacity-0 hover:opacity-100' : 'relative'}
            `}>
                <StatusBar key={fileId} content={editor?.getHTML() || ''} />
            </div>

        </div>
    );
};

export default Editor;
