// Oct 2026: aviso de la Memoria con "Deshacer" y "Ver" (abre el panel Memoria).
import React from 'react';
import { toast } from 'sonner';
import { Brain } from 'lucide-react';

export const OPEN_MEMORY_PANEL = 'OPEN_MEMORY_PANEL';
export const openMemoryPanel = () => window.dispatchEvent(new CustomEvent(OPEN_MEMORY_PANEL));

export function showMemoryToast(summary: string, onUndo: () => void) {
    toast.custom((id) => (
        <div className="w-[356px] rounded-lg border border-purple-800/50 bg-titanium-900 p-3.5 shadow-xl text-titanium-100">
            <p className="flex items-start gap-2 text-xs leading-relaxed">
                <Brain size={14} className="mt-0.5 shrink-0 text-purple-400" />
                <span><b>Memoria:</b> {summary}</span>
            </p>
            <div className="mt-2.5 flex justify-end gap-2">
                <button onClick={() => { toast.dismiss(id); openMemoryPanel(); }} className="rounded-md px-2.5 py-1 text-[11px] text-titanium-300 hover:bg-titanium-800">Ver memoria</button>
                <button onClick={() => { toast.dismiss(id); onUndo(); }} className="rounded-md bg-purple-700/70 px-2.5 py-1 text-[11px] font-medium hover:bg-purple-600">Deshacer</button>
            </div>
        </div>
    ), { duration: 10000 });
}
