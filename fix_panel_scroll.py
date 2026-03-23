import re

with open('src/components/ArquitectoPanel.tsx', 'r') as f:
    content = f.read()

content = content.replace("className={`absolute top-0 left-0 w-full z-40 transition-transform duration-300 ease-in-out origin-top ${isPendingDrawerOpen ? 'translate-y-0 scale-y-100 opacity-100' : '-translate-y-full scale-y-0 opacity-0 pointer-events-none'}`}",
                          "className={`absolute top-0 left-0 w-full z-40 transition-transform duration-300 ease-in-out origin-top max-h-[60vh] overflow-y-auto custom-scrollbar ${isPendingDrawerOpen ? 'translate-y-0 scale-y-100 opacity-100' : '-translate-y-full scale-y-0 opacity-0 pointer-events-none'}`}")

with open('src/components/ArquitectoPanel.tsx', 'w') as f:
    f.write(content)
