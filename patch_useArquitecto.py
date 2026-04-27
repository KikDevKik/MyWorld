import re

with open("src/hooks/useArquitecto.ts", "r") as f:
    content = f.read()

replacement = """    // Ghost mode simulation
    const isGhostMode = import.meta.env.VITE_JULES_MODE === 'true';

    // 🟢 Fix A: Restauración al montar (Persistencia)
    useEffect(() => {
        const cachedItems = useLayoutStore.getState().arquitectoPendingItems;
        const cachedSummary = config?.arquitectoSummary;

        if (cachedItems && cachedItems.length > 0) {
            setPendingItems(cachedItems);
        }
        if (cachedSummary) {
            setProjectSummary(cachedSummary);
        }
    }, []); // 👈 Solo al montar el hook

    const initialize = useCallback(async () => {"""

content = content.replace("    // Ghost mode simulation\n    const isGhostMode = import.meta.env.VITE_JULES_MODE === 'true';\n\n    const initialize = useCallback(async () => {", replacement)

# We also need to import useEffect if not imported
if "useEffect" not in content[:content.find("\n", content.find("import { useState, useCallback, useRef }"))]:
    content = content.replace("import { useState, useCallback, useRef }", "import { useState, useCallback, useRef, useEffect }")

with open("src/hooks/useArquitecto.ts", "w") as f:
    f.write(content)
