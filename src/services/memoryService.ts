// Oct 2026: Memoria de MyWorld (cliente).
// Tras cada respuesta del Director/Arquitecto se pide al servidor que decida qué recordar.
// Si guarda algo, aparece un aviso discreto con botón "Deshacer".
import { toast } from 'sonner';
import { showMemoryToast } from '../components/ui/MemoryToast';
import { callFunction } from './api';

export interface SavedMemoryItem { op: string; slug: string; fileName: string; lineId: string; text: string; previousText?: string; }

export function rememberExchange(params: {
    userMessage: string;
    assistantMessage: string;
    tool: 'director' | 'arquitecto' | 'laboratorio';
    accessToken?: string | null;
    activeFileName?: string | null;
}): void {
    if (!params.userMessage?.trim() || !params.assistantMessage?.trim()) return;
    callFunction<{ saved: SavedMemoryItem[] }>('updateMemory', {
        userMessage: params.userMessage,
        assistantMessage: params.assistantMessage,
        tool: params.tool,
        accessToken: params.accessToken || undefined,
        activeFileName: params.activeFileName || undefined,
    }, { timeout: 120000 }).then(res => {
        const saved = res?.saved || [];
        if (!saved.length) return;
        const verb = (op: string) => op === 'remove' ? 'olvidé' : op === 'update' ? 'actualicé' : 'guardé';
        const summary = saved.map(s => `${verb(s.op)} que ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)}`).join(' · ');
        showMemoryToast(summary, () => {
            callFunction('undoMemory', { items: saved, accessToken: params.accessToken || undefined })
                .then(() => toast.success('Memoria: cambio deshecho.'))
                .catch(() => toast.error('No se pudo deshacer.'));
        });
    }).catch(() => { /* la memoria es un extra: nunca molesta si falla */ });
}
