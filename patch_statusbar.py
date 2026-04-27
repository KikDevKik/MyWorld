with open("src/components/ui/StatusBar.tsx", "r") as f:
    content = f.read()

search_str = """                            {/* POPUP TOOLTIP */}
                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-titanium-950 border border-titanium-700/50 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 overflow-hidden flex flex-col">
                                <div className="bg-titanium-900/50 px-3 py-2 border-b border-titanium-800 flex items-center gap-2 shrink-0">
                                    <Landmark size={12} className="text-emerald-400" />
                                    <span className="text-[10px] font-bold text-titanium-200 uppercase tracking-wider">
                                        {arquitectoPendingItems.length} misiones pendientes
                                    </span>
                                </div>
                                <div className="p-2 flex flex-col gap-2">
                                    {arquitectoPendingItems.slice(0, 5).map((item: any, idx: number) => (
                                        <div key={idx} className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-titanium-300 leading-tight flex gap-1">
                                                <span className="text-titanium-500">-</span>
                                                {item.title}
                                            </span>
                                            <span className="text-[9px] text-titanium-500 leading-tight pl-2.5 line-clamp-2">
                                                {item.description}
                                            </span>
                                        </div>
                                    ))}
                                    {arquitectoPendingItems.length > 5 && (
                                        <div className="text-[9px] text-titanium-500 text-center pt-1 font-medium border-t border-titanium-800/50 mt-1">
                                            y {arquitectoPendingItems.length - 5} más... (clic para abrir)
                                        </div>
                                    )}
                                </div>
                            </div>"""

replace_str = """                            {/* POPUP TOOLTIP (Rediseñado Fix B) */}
                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-titanium-900 border border-titanium-700 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 overflow-hidden flex flex-col max-w-xs">
                                <div className="bg-titanium-900 px-3 py-2 border-b border-titanium-700 flex items-center gap-2 shrink-0">
                                    <Landmark size={12} className="text-emerald-400" />
                                    <span className="text-[10px] font-bold text-titanium-200 uppercase tracking-wider">
                                        MISIONES PENDIENTES [{arquitectoPendingItems.length}]
                                    </span>
                                </div>
                                <div className="p-2 flex flex-col gap-3">
                                    {arquitectoPendingItems.slice(0, 5).map((item: any, idx: number) => (
                                        <div key={idx} className="flex flex-col gap-1">
                                            <span className="text-xs font-bold text-cyan-400 leading-tight flex gap-1.5 items-start">
                                                <span className="text-titanium-500 mt-[1px]">•</span>
                                                <span className="line-clamp-1">{item.title}</span>
                                            </span>
                                            <span className="text-xs text-titanium-400 leading-tight pl-3 line-clamp-2">
                                                {item.description}
                                            </span>
                                        </div>
                                    ))}
                                    {arquitectoPendingItems.length > 5 && (
                                        <div className="text-xs text-titanium-400 text-left pl-3 pt-1 font-medium mt-1">
                                            [+ {arquitectoPendingItems.length - 5} más]
                                        </div>
                                    )}
                                </div>
                            </div>"""

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open("src/components/ui/StatusBar.tsx", "w") as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Could not find the search string in StatusBar.tsx")
