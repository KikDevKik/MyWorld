import React from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import SkipToContent from '../components/ui/SkipToContent'; // 🎨 PALETTE: Accessibility Skip Link
import { GemId } from '../types';

interface SentinelShellProps {
    sidebar: React.ReactNode;
    editor: React.ReactNode;
    tools: React.ReactNode;
    isZenMode: boolean; // Kept for legacy "Zen" toggle (Command Bar) if needed, or we can map it too.
    // Removed old props: isToolsExpanded, toolsMode - now derived from activeView
}

// 🟢 HEAVY TOOLS: Hide Sidebar to Maximize Space
const HEAVY_TOOLS: string[] = ['forja', 'perforador', 'laboratorio', 'cronograma', 'imprenta'];

// 🟢 SIDE TOOLS: Render in Zone C (Overlay or Split)
const SIDE_TOOLS: string[] = ['director', 'tribunal', 'guardian', 'chat', 'sentinel'];

const SentinelShell: React.FC<SentinelShellProps> = ({
    sidebar,
    editor,
    tools,
    isZenMode,
}) => {
    // 🟢 GLOBAL STATE
    const {
        activeView,
        isDirectorMaximized,
        isArsenalWide,
        directorWidth, setDirectorWidth,
        tribunalWidth, setTribunalWidth,
        guardianWidth, setGuardianWidth
    } = useLayoutStore();

    // 🟢 DRAG STATE TO DISABLE TRANSITIONS
    const [isDragging, setIsDragging] = React.useState(false);

    // 🟢 DRAG HANDLE LOGIC
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        const startX = e.clientX;
        // Determine start width based on active view
        let startWidth = 400;
        if (activeView === 'director') startWidth = directorWidth;
        else if (activeView === 'tribunal') startWidth = tribunalWidth;
        else if (activeView === 'guardian') startWidth = guardianWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
             // Calculate delta from Right Edge?
             // Zone C is on the right.
             // If I drag LEFT, width increases.
             // If I drag RIGHT, width decreases.
             const delta = startX - moveEvent.clientX;
             const newWidth = Math.max(350, Math.min(window.innerWidth, startWidth + delta));

             if (activeView === 'director') setDirectorWidth(newWidth);
             else if (activeView === 'tribunal') setTribunalWidth(newWidth);
             else if (activeView === 'guardian') setGuardianWidth(newWidth);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
            setIsDragging(false);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
    };

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
    const isHeavyTool = HEAVY_TOOLS.includes(activeView); // 🟢 CHECK FOR HEAVY TOOL

    // Determine Zone C width/style
    // If it's visible, is it expanded?
    // In the new model, if activeView is a Side Tool, Zone C IS the tool.
    // "Overlay" behavior was previously for Director.
    // The user said: "Director lives in ArsenalDock (right)... ensure... opening logic updates activeView to 'director'".

    // Logic for Zone C classes:
    let zoneCClasses = `flex flex-row relative ${isDragging ? 'transition-none' : 'transition-all duration-300 ease-in-out'}`;
    let zoneCStyle: React.CSSProperties = {};

    if (isHeavyTool) {
        // 🟢 OVERLAY MODE FOR HEAVY TOOLS (Perforador, etc.)
        // Makes the dock transparent and floating to allow full-screen canvas
        zoneCClasses += " absolute right-0 top-0 bottom-0 z-40 bg-transparent pointer-events-none w-16";
    } else {
        // STANDARD MODE (Split View)
        zoneCClasses += " bg-titanium-950 border-l border-titanium-800";

        if (!isZoneCVisible) {
             zoneCClasses += " w-16"; // Minimum width for Dock
        } else {
            // Active View is a Side Tool -> Expanded
            if (activeView === 'director') {
                 // 🟢 DIRECTOR ELASTIC MODE
                 zoneCStyle = { width: `${directorWidth}px` };
            } else if (activeView === 'tribunal') {
                 // 🟢 TRIBUNAL ELASTIC MODE
                 zoneCStyle = { width: `${tribunalWidth}px` };
            } else if (activeView === 'guardian') {
                 // 🟢 GUARDIAN ELASTIC MODE
                 zoneCStyle = { width: `${guardianWidth}px` };
            } else {
                 // Legacy Modes for other tools (Chat history?)
                 // Or maybe all side tools should share the width?
                 // User instruction: "Scope limitado al Director... por ahora".
                 const widthClass = isArsenalWide ? "w-[50vw] max-w-3xl" : "w-[26rem]";
                 zoneCClasses += ` ${widthClass}`;
            }
        }
    }

    // Special Case: Zen Mode hides EVERYTHING except Editor?
    if (isZenMode) {
         zoneCClasses = "hidden"; // Or w-0
    }

    // 🟢 SHOW DRAG HANDLE FOR RESIZABLE TOOLS
    const isResizable = ['director', 'tribunal', 'guardian'].includes(activeView);

    return (
        <div
            className="h-screen w-screen overflow-hidden bg-titanium-900 text-titanium-100 flex flex-row relative"
            data-active-view={activeView}
            data-show-sidebar={showSidebar.toString()}
        >
            <SkipToContent />

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
            <main
                id="main-content" // 🎨 PALETTE: Target for SkipToContent
                className="flex-1 relative flex flex-col min-w-0 bg-titanium-950 transition-all duration-300 outline-none"
                tabIndex={-1} // Allow programmatic focus
            >
                {editor}
            </main>

            {/* 🟢 DRAG HANDLE (Only for Director, inserted between Zones) */}
            {isResizable && (
                <div
                    onMouseDown={handleMouseDown}
                    className="w-1 hover:w-2 bg-titanium-900 hover:bg-cyan-500 cursor-col-resize z-50 flex-shrink-0 transition-colors delay-150"
                    title="Arrastrar para redimensionar"
                />
            )}

            {/* ZONA C: INTELIGENCIA (DOCK + SIDE PANELS) */}
            <aside className={zoneCClasses} style={zoneCStyle}>
               {tools}
            </aside>
        </div>
    );
};

export default SentinelShell;
