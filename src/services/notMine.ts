// Nov 2026: «Esto no es mío». El autor dice qué inventó o entendió mal la IA y queda guardado
// como corrección para todas las herramientas (Ideas, Mira y el Arquitecto la leen).
import { toast } from 'sonner';
import { callFunction } from './api';
import { promptDialog } from '../components/ui/confirmDialog';

export type NotMineTool = 'ideas' | 'mira' | 'arquitecto';

export async function reportNotMine(tool: NotMineTool): Promise<void> {
    const text = await promptDialog({
        title: '¿Qué no era tuyo?',
        message: 'Cuéntame en una línea qué inventé o entendí mal. Lo recuerdo para no repetirlo, aquí y en las demás herramientas.',
        placeholder: 'Nunca dije que tuviera cola',
        confirm: 'Guardar corrección',
    });
    if (!text || !text.trim()) return;
    try {
        await callFunction('whatIf', { mode: 'correct', text: text.trim(), tool });
        toast.success('Anotado. No lo repito.');
    } catch (e: any) {
        toast.error(e?.message || 'No pude guardar la corrección.');
    }
}
