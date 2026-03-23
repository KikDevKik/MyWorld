import re

with open('src/stores/useLayoutStore.ts', 'r') as f:
    layout = f.read()

layout = layout.replace("    arquitectoWidgetVisible: boolean;", "  arquitectoWidgetVisible: boolean;")
layout = layout.replace("    arquitectoWidgetVisible: true,", "  arquitectoWidgetVisible: true,")

with open('src/stores/useLayoutStore.ts', 'w') as f:
    f.write(layout)

with open('src/components/ArquitectoPendingWidget.tsx', 'r') as f:
    widget = f.read()

widget = widget.replace('<div className="flex items-center gap-2"><button', '<div className="flex items-center gap-2">\n                    <button')
widget = widget.replace('</button></div>', '</button>\n                    </div>')

with open('src/components/ArquitectoPendingWidget.tsx', 'w') as f:
    f.write(widget)
