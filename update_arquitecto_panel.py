import sys

with open('src/components/ArquitectoPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
imports = "import ArquitectoPendingWidget from './ArquitectoPendingWidget';"
new_imports = """import ContradiccionesDrawer from './architect/ContradiccionesDrawer';
import ColisionesMap from './architect/ColisionesMap';
import RoadmapFinalView from './architect/RoadmapFinalView';
import ArquitectoPendingWidget from './ArquitectoPendingWidget';"""
content = content.replace(imports, new_imports)

lucide_import = "import { Plus, X, Maximize2, Minimize2, Send, Loader2, Sparkles, Network } from 'lucide-react';"
new_lucide_import = "import { Plus, X, Maximize2, Minimize2, Send, Loader2, Sparkles, Network, Map, Book } from 'lucide-react';"
content = content.replace(lucide_import, new_lucide_import)

# 2. useArquitecto hook
old_hook = """        recalculateCards
    } = useArquitecto(folderId, user, auth.currentUser);"""

new_hook = """        recalculateCards,
        lastDetectedIntent,
        focusMode,
        setFocusMode
    } = useArquitecto(folderId, user, auth.currentUser);"""
content = content.replace(old_hook, new_hook)

# 3. Focus Selector Props
old_focus = """                    <ArquitectoFocusSelector 
                        sessionId={sessionId}
                        currentObjective={currentObjective}
                        setCurrentObjective={setCurrentObjective}
                        disabled={isConnecting}
                    />"""

new_focus = """                    <ArquitectoFocusSelector 
                        sessionId={sessionId}
                        currentObjective={currentObjective}
                        setCurrentObjective={setCurrentObjective}
                        focusMode={focusMode}
                        setFocusMode={setFocusMode}
                        disabled={isConnecting}
                    />"""
content = content.replace(old_focus, new_focus)

# 4. Intent badge
# To match exactly, I'll search for the span element specifically
old_span = """<span className="text-[10px] font-mono text-cyan-400 mt-1 uppercase tracking-wider">
                                                El Arquitecto
                                            </span>
                                        )}"""
new_span = """<span className="text-[10px] font-mono text-cyan-400 mt-1 uppercase tracking-wider">
                                                El Arquitecto
                                            </span>
                                        )}
                                        
                                        {msg.sender === 'ia' && lastDetectedIntent && msg.id === messages[messages.length - 1]?.id && (
                                            <div className="flex items-center gap-1.5 mt-1">
                                                {lastDetectedIntent === 'RESOLUCION' && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        ✓ RESOLUCIÓN
                                                    </span>
                                                )}
                                                {lastDetectedIntent === 'REFUTACION' && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        ⚡ REFUTACIÓN
                                                    </span>
                                                )}
                                                {lastDetectedIntent === 'CONSULTA' && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                        📖 CONSULTA
                                                    </span>
                                                )}
                                                {lastDetectedIntent === 'DEBATE' && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-titanium-800 text-titanium-500 border border-titanium-700">
                                                        ⚔ DEBATE
                                                    </span>
                                                )}
                                            </div>
                                        )}"""
content = content.replace(old_span, new_span)

# 5. Replace Pending Widget with Drawer
old_drawer_start = "            {pendingItems.length > 0 && ("
old_drawer_end = "            )}\n"

start_idx = content.find(old_drawer_start)

if start_idx != -1:
    # Need to find the matching closing bracket
    # Since we know where it ends exactly in the file, we can look for `<ArquitectoToolbar`
    end_idx = content.find("<ArquitectoToolbar", start_idx)
    if end_idx != -1:
        new_drawer = """            {pendingItems.length > 0 && (
                <ContradiccionesDrawer
                    pendingItems={pendingItems}
                    isOpen={isPendingDrawerOpen}
                    onToggle={() => setIsPendingDrawerOpen(v => !v)}
                    activeItemCode={activeItemCode || undefined}
                    onSelectItem={(item) => {
                        sendMessage(`[Retomar disonancia: ${item.code}] ${item.title}`);
                        setIsPendingDrawerOpen(false);
                    }}
                />
            )}
            
            """
        content = content[:start_idx] + new_drawer + content[end_idx:]


# 6. Add slide up panels
old_slides = """                {activeTool === 'domino' && (
                    <div className="p-4 h-full">
                        <p className="text-sm text-titanium-400 mb-4">Visualización de nodos afectados.</p>
                        {/* Aquí iría el Grafo del Efecto Dominó */}
                    </div>
                )}
            </SlideUpPanel>"""

new_slides = """                {activeTool === 'domino' && (
                    <div className="p-4 h-full">
                        <p className="text-sm text-titanium-400 mb-4">Visualización de nodos afectados.</p>
                        {/* Aquí iría el Grafo del Efecto Dominó */}
                    </div>
                )}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'map'}
                title="Mapa de Colisiones"
                icon={<Map size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'map' && (
                    <ColisionesMap 
                        pendingItems={pendingItems}
                        onSelectItem={(item) => {
                            setActiveTool('none');
                            setIsPendingDrawerOpen(true);
                        }}
                    />
                )}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'lore'}
                title="Roadmap Final"
                icon={<Book size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'lore' && (
                    <RoadmapFinalView sessionId={sessionId} />
                )}
            </SlideUpPanel>"""

content = content.replace(old_slides, new_slides)

with open('src/components/ArquitectoPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('ArquitectoPanel updated successfully!')
