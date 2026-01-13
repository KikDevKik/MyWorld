import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
    content: string;
    mode: 'compact' | 'full';
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, mode }) => {

    const components: any = {
        // BOLD: Neon Cyan Glow (Common)
        strong: ({ node, ...props }: any) => (
            <strong className="text-cyan-400 font-bold drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" {...props} />
        ),

        // ITALICS: Subtle Titanium (Common)
        em: ({ node, ...props }: any) => (
            <em className="text-titanium-400 italic opacity-80" {...props} />
        ),

        // HEADERS: Adaptive
        h1: ({ node, ...props }: any) => mode === 'full' ? (
            <h1 className="text-2xl font-bold text-white mt-6 mb-4 font-serif tracking-wider border-b border-white/10 pb-2" {...props} />
        ) : (
            <strong className="block font-bold text-white text-sm mt-2 mb-1 border-b border-titanium-700/50 pb-0.5" {...props} />
        ),

        h2: ({ node, ...props }: any) => mode === 'full' ? (
            <h2 className="text-xl font-bold text-white mt-5 mb-3 font-serif tracking-wide border-b border-white/5 pb-1" {...props} />
        ) : (
            <strong className="block font-bold text-titanium-200 text-sm mt-1.5 mb-0.5" {...props} />
        ),

        h3: ({ node, ...props }: any) => mode === 'full' ? (
            <h3 className="text-lg font-bold text-titanium-100 mt-4 mb-2 font-serif" {...props} />
        ) : (
            <strong className="block font-semibold text-titanium-300 text-xs uppercase tracking-wide mt-1" {...props} />
        ),

        // PARAGRAPHS
        p: ({ node, ...props }: any) => (
            <p className={`text-titanium-200 font-serif ${mode === 'full' ? 'mb-4 leading-loose' : 'mb-2 leading-snug text-xs'}`} {...props} />
        ),

        // LISTS
        ul: ({ node, ...props }: any) => (
            <ul className={`list-disc list-outside marker:text-cyan-500/50 ${mode === 'full' ? 'ml-6 mb-4 space-y-2' : 'ml-4 mb-2 space-y-0.5'}`} {...props} />
        ),
        ol: ({ node, ...props }: any) => (
            <ol className={`list-decimal list-outside marker:text-cyan-500/50 ${mode === 'full' ? 'ml-6 mb-4 space-y-2' : 'ml-4 mb-2 space-y-0.5'}`} {...props} />
        ),
        li: ({ node, ...props }: any) => (
            <li className={`text-titanium-300 ${mode === 'full' ? '' : 'text-xs pl-1'}`} {...props} />
        ),

        // BLOCKQUOTES
        blockquote: ({ node, ...props }: any) => (
            <blockquote className={`border-l-2 border-cyan-500/50 pl-4 italic text-titanium-400 ${mode === 'full' ? 'my-4' : 'my-2 text-xs'}`} {...props} />
        ),

        // CODE (Inline)
        code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline ? (
                <div className="overflow-x-hidden w-full my-4 rounded-lg bg-titanium-900 border border-titanium-800">
                     <div className="flex items-center justify-between px-4 py-2 bg-titanium-950/50 border-b border-titanium-800">
                        <span className="text-xs text-titanium-500 font-mono uppercase">{match ? match[1] : 'CODE'}</span>
                    </div>
                    <pre className="p-4 overflow-x-hidden whitespace-pre-wrap break-all text-xs font-mono text-cyan-100/90" style={{ overflowWrap: 'anywhere' }}>
                        <code className={className} {...props}>
                            {children}
                        </code>
                    </pre>
                </div>
            ) : (
                <code className="bg-titanium-800 text-cyan-200 px-1 py-0.5 rounded text-xs font-mono break-all whitespace-pre-wrap" {...props}>
                    {children}
                </code>
            );
        },

        pre: ({ node, ...props }: any) => (
             <div className="not-prose" {...props} />
        )
    };

    return (
        <ReactMarkdown components={components}>
            {content}
        </ReactMarkdown>
    );
};

export default MarkdownRenderer;
