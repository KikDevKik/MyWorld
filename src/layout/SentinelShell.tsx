import React from 'react';

interface SentinelShellProps {
    sidebar: React.ReactNode;
    editor: React.ReactNode;
    tools: React.ReactNode;
    isZenMode: boolean;
    isToolsExpanded: boolean;
}

const SentinelShell: React.FC<SentinelShellProps> = ({
    sidebar,
    editor,
    tools,
    isZenMode,
    isToolsExpanded
}) => {
    return (
        <div className="h-screen w-screen overflow-hidden bg-titanium-900 text-titanium-100 flex flex-row">
            {/* ZONA A: MEMORIA */}
            <aside
                className={`
                    bg-titanium-800 border-r border-titanium-500/20 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col
                    ${isZenMode ? 'w-0 opacity-0 overflow-hidden' : 'w-72 opacity-100'}
                `}
            >
                {sidebar}
            </aside>

            {/* ZONA B: ACCIÓN */}
            <main className="flex-1 relative flex flex-col min-w-0 bg-titanium-950 transition-all duration-300">
                {editor}
            </main>

            {/* ZONA C: INTELIGENCIA */}
            <aside
                className={`
                    bg-titanium-950 border-l border-titanium-800 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-row
                    ${isZenMode ? 'w-0 opacity-0 overflow-hidden border-none' : (isToolsExpanded ? 'w-[26rem]' : 'w-16')}
                `}
            >
               {tools}
            </aside>
        </div>
    );
};

export default SentinelShell;
