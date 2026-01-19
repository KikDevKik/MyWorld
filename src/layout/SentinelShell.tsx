import React from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { GemId } from '../types';

interface SentinelShellProps {
    sidebar: React.ReactNode;
    editor: React.ReactNode;
    tools: React.ReactNode;
    isZenMode: boolean; // Kept for legacy "Zen" toggle (Command Bar) if needed, or we can map it too.
    // Removed old props: isToolsExpanded, toolsMode - now derived from activeView
}

// 🟢 HEAVY TOOLS: Hide Sidebar to Maximize Space
const HEAVY_TOOLS: string[] = ['forja', 'perforador', 'laboratorio', 'cronograma', 'guardian', 'imprenta'];

// 🟢 SIDE TOOLS: Render in Zone C (Overlay or Split)
const SIDE_TOOLS: string[] = ['director', 'tribunal', 'chat', 'sentinel'];

const SentinelShell: React.FC<SentinelShellProps> = ({
    sidebar,
    editor,
    tools,
    isZenMode,
}) => {
    // 🟢 GLOBAL STATE
    const { activeView, isDirectorMaximized, isArsenalWide } = useLayoutStore();

    // 1. CALCULATE SIDEBAR VISIBILITY (Zone A)
    // Truth Table:
    // - Editor -> Visible
    // - Director (Standard) -> Visible
    // - Director (Maximized) -> Hidden
    // - Heavy Tools -> Hidden
    // - Zen Mode -> Hidden

    let showSidebar = true;

    if (isZenMode) {
        showSidebar = false;
    } else if (HEAVY_TOOLS.includes(activeView)) {
        showSidebar = false;
    } else if (activeView === 'director' && isDirectorMaximized) {
        showSidebar = false;
    }
    // Default is true (Editor, Director Standard, Chat, etc.)

    // 2. CALCULATE ZONE C VISIBILITY & MODE
    const isZoneCVisible = SIDE_TOOLS.includes(activeView);

    // Determine Zone C width/style
    // If it's visible, is it expanded?
    // In the new model, if activeView is a Side Tool, Zone C IS the tool.
    // "Overlay" behavior was previously for Director.
    // The user said: "Director lives in ArsenalDock (right)... ensure... opening logic updates activeView to 'director'".

    // Logic for Zone C classes:
    let zoneCClasses = "bg-titanium-950 border-l border-titanium-800 transition-all duration-300 ease-in-out flex flex-row";

    if (!isZoneCVisible) {
         // Collapsed (only Arsenal Dock width handled by the Dock itself? No, Shell handles container)
         // Wait, ArsenalDock is ALWAYS visible?
         // "Excepción del Director: El Director suele vivir en el ArsenalDock".
         // ArsenalDock is the column of icons. That should ALWAYS be visible?
         // In previous code, ArsenalDock was passed as part of `tools`.
         // `tools` prop contained BOTH ArsenalDock AND the Expanded Content.
         // If I hide Zone C, I hide the Dock!

         // 🟢 CORRECTION: Zone C contains ArsenalDock + ExpandedPanel.
         // ArsenalDock should always be visible (unless Zen?).
         // The "Expanded" part depends on `activeView`.

         // Let's assume `tools` passed from App contains everything (Dock + Panel).
         // So Zone C must accommodate the Dock width at minimum.

         zoneCClasses += " w-16"; // Minimum width for Dock
    } else {
        // Active View is a Side Tool -> Expanded

        // Check for Overlay Mode (if requested, but user said "Director... coexiste con el Editor").
        // "Coexiste" implies Split View (Flex), NOT Overlay.
        // However, previous memory said "Full Focus... triggers Overlay".
        // User request: "Director es la única herramienta... que coexiste... [Sidebar] + [Editor] + [Director]".
        // This implies 3-column layout.

        // Strategist Mode (isArsenalWide) logic:
        const widthClass = isArsenalWide ? "w-[50vw] max-w-3xl" : "w-[26rem]";
        zoneCClasses += ` ${widthClass}`;
    }

    // Special Case: Zen Mode hides EVERYTHING except Editor?
    if (isZenMode) {
         zoneCClasses = "hidden"; // Or w-0
    }

    return (
        <div
            className="h-screen w-screen overflow-hidden bg-titanium-900 text-titanium-100 flex flex-row relative"
            data-active-view={activeView}
            data-show-sidebar={showSidebar.toString()}
        >
            {/* ZONA A: MEMORIA (SIDEBAR) */}
            <aside
                className={`
                    bg-titanium-800 border-r border-titanium-500/20 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col
                    ${showSidebar ? 'w-72 opacity-100' : 'w-0 opacity-0 overflow-hidden border-none hidden'}
                `}
            >
                {sidebar}
            </aside>

            {/* ZONA B: ACCIÓN (EDITOR / HEAVY TOOLS) */}
            <main className="flex-1 relative flex flex-col min-w-0 bg-titanium-950 transition-all duration-300">
                {editor}
            </main>

            {/* ZONA C: INTELIGENCIA (DOCK + SIDE PANELS) */}
            <aside className={zoneCClasses}>
               {tools}
            </aside>
        </div>
    );
};

export default SentinelShell;
