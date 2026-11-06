import React from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import SkipToContent from '../components/ui/SkipToContent'; // 🎨 PALETTE: Accessibility Skip Link
import { GemId } from '../types';
import { useIsNarrow } from '../hooks/useMediaQuery';

interface SentinelShellProps {
    sidebar: React.ReactNode;
    editor: React.ReactNode;
    tools: React.ReactNode;
    isZenMode: boolean; // Kept for legacy "Zen" toggle (Command Bar) if needed, or we can map it too.
    activeFileId?: string | null; // Nov 2026: al abrir un documento se cierra el cajón en pantallas angostas
    // Removed old props: isToolsExpanded, toolsMode - now derived from activeView
}

// 🟢 HEAVY TOOLS: Hide Sidebar to Maximize Space
const HEAVY_TOOLS: string[] = ['forja', 'perforador', 'laboratorio', 'cronograma', 'imprenta', 'arquitecto'];

// 🟢 SIDE TOOLS: Render in Zone C (Overlay or Split)
// Nov 2026: Mira (director) ya no es panel lateral: se abre como ventana central (MiraDialog).
const SIDE_TOOLS: string[] = ['tribunal', 'guardian', 'chat', 'sentinel'];

const SentinelShell: React.FC<SentinelShellProps> = ({
    sidebar,
    editor,
    tools,
    isZenMode,
    activeFileId,
}) => {
    // 🟢 GLOBAL STATE
    const {
        activeView,
        isDirectorMaximized,
        isArsenalWide,
        directorWidth, setDirectorWidth,
        tribunalWidth, setTribunalWidth,
        guardianWidth, setGuardianWidth,
        vaultDrawerOpen, setVaultDrawerOpen
    } = useLayoutStore();

    // Nov 2026: pantallas angostas (menos de 1024 px). La barra de documentos se abre encima, como un cajón,
    // y los paneles laterales se superponen en vez de apretar el texto.
    const narrow = useIsNarrow();
    React.useEffect(() => { setVaultDrawerOpen(false); }, [activeFileId, activeView, narrow, setVaultDrawerOpen]);
    React.useEffect(() => {
        if (!narrow || !vaultDrawerOpen) return;
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setVaultDrawerOpen(false); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [narrow, vaultDrawerOpen, setVaultDrawerOpen]);
    // Cerrado, el cajón no recibe foco ni clics (inert); abierto, el foco entra en él.
    const drawerRef = React.useRef<HTMLElement>(null);
    React.useEffect(() => {
        const el = drawerRef.current;
        if (!el) return;
        if (vaultDrawerOpen) { el.removeAttribute('inert'); requestAnimationFrame(() => (el.querySelector('input, button, [href], [tabindex]:not([tabindex="-1"])') as HTMLElement | null)?.focus()); }
        else el.setAttribute('inert', '');
    }, [vaultDrawerOpen, narrow]);

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
    let zoneCClasses = `flex flex-row relative overflow-hidden ${isDragging ? 'transition-none' : 'transition-all duration-300 ease-in-out'}`;
    let zoneCStyle: React.CSSProperties = {};

    const zoneCOverlay = narrow && isZoneCVisible && !isHeavyTool;
    if (zoneCOverlay) {
        // Nov 2026: en pantallas angostas el panel lateral se pone encima del texto (con el riel a su izquierda).
        zoneCClasses += " absolute right-0 top-0 bottom-0 z-50 w-full max-w-[36rem] bg-titanium-950 border-l border-titanium-800 shadow-[-20px_0_60px_rgba(0,0,0,0.45)]";
    } else if (isHeavyTool) {
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
    const isResizable = !narrow && ['tribunal', 'guardian'].includes(activeView);

    return (
        <div
            className="h-dvh w-screen overflow-hidden bg-titanium-900 text-titanium-100 flex flex-row relative"
            data-active-view={activeView}
            data-show-sidebar={showSidebar.toString()}
        >
            <SkipToContent />

            {/* ZONA A: MEMORIA (SIDEBAR) */}
            {narrow ? (
                <>
                    {/* Cajón: siempre montado para no perder el árbol abierto; se desliza desde la izquierda. */}
                    <div
                        aria-hidden="true"
                        onMouseDown={() => setVaultDrawerOpen(false)}
                        className={`fixed inset-0 z-[70] bg-titanium-950/60 backdrop-blur-[2px] transition-opacity duration-200 ${vaultDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    />
                    <aside
                        id="vault-drawer"
                        aria-label="Tus documentos"
                        aria-hidden={!vaultDrawerOpen}
                        ref={drawerRef}
                        className={`fixed left-0 top-0 bottom-0 z-[71] w-[min(20rem,86vw)] bg-titanium-800 border-r border-titanium-500/20 flex flex-col overflow-hidden transition-transform duration-200 ease-out motion-reduce:transition-none ${vaultDrawerOpen ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.45)]' : '-translate-x-full'}`}
                    >
                        {sidebar}
                    </aside>
                </>
            ) : (
                <aside
                    className={`
                        bg-titanium-800 border-r border-titanium-500/20 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col overflow-hidden
                        ${showSidebar ? 'w-72 opacity-100' : 'w-0 opacity-0 border-none hidden'}
                    `}
                >
                    {sidebar}
                </aside>
            )}

            {/* ZONA B: ACCIÓN (EDITOR / HEAVY TOOLS) */}
            <main
                id="main-content" // 🎨 PALETTE: Target for SkipToContent
                className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-titanium-950 transition-all duration-300 outline-none"
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

            {/* Con el panel encima, este hueco guarda el sitio del riel para que el texto no salte. */}
            {zoneCOverlay && <div className="w-16 flex-shrink-0" aria-hidden="true" />}

            {/* ZONA C: INTELIGENCIA (DOCK + SIDE PANELS) */}
            <aside className={zoneCClasses} style={zoneCStyle}>
                {tools}
            </aside>
        </div>
    );
};

export default SentinelShell;
