// Nov 2026: diálogo de confirmación propio. Reemplaza a window.confirm, que abría el aviso del navegador
// («myworldhistory.site dice…»), fuera del estilo de la app. Se usa igual de corto:
//     if (!(await confirmDialog('¿Empezar una conversación nueva?'))) return;
// o con detalle:
//     await confirmDialog({ title: '…', message: '…', confirm: 'Borrar', danger: true })
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MiraSprite } from '../mira/MiraSprite';

export interface ConfirmOptions {
    title?: string;
    message: string;
    confirm?: string;
    cancel?: string;
    /** acción que borra o no se puede deshacer: botón rojo y el foco empieza en «Cancelar» */
    danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
    placeholder?: string;
    initial?: string;
    /** texto que aparece sobre el campo (p. ej. «Escribe Borrar para confirmar») */
    label?: string;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean, value?: string) => void; input?: { placeholder?: string; initial?: string; label?: string } }

let push: ((p: Pending) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
    const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>(resolve => {
        // Sin anfitrión montado (no debería pasar): se conserva el comportamiento anterior.
        if (!push) { resolve(window.confirm(o.message)); return; }
        push({ ...o, resolve });
    });
}

/** Pide un texto corto (un nombre, una palabra de confirmación). Devuelve null si se cancela. Reemplaza a window.prompt. */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
    return new Promise<string | null>(resolve => {
        if (!push) { resolve(window.prompt(opts.message, opts.initial || '')); return; }
        push({ ...opts, input: { placeholder: opts.placeholder, initial: opts.initial, label: opts.label }, resolve: (ok, value) => resolve(ok ? (value ?? '') : null) });
    });
}

const lang = () => { try { return localStorage.getItem('myworld_language_preference') || 'es'; } catch { return 'es'; } };
const LABELS: Record<string, { ok: string; cancel: string; title: string }> = {
    es: { ok: 'Sí, seguir', cancel: 'Cancelar', title: '¿Seguimos?' },
    en: { ok: 'Yes, go on', cancel: 'Cancel', title: 'Go ahead?' },
};

/** Se monta una sola vez, en App. */
export const ConfirmHost: React.FC = () => {
    const [queue, setQueue] = useState<Pending[]>([]);
    const okRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const lastFocus = useRef<HTMLElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState('');
    const cur = queue[0];

    useEffect(() => {
        push = p => setQueue(q => [...q, p]);
        return () => { push = null; };
    }, []);

    const close = (ok: boolean) => {
        if (!cur) return;
        cur.resolve(ok, value);
        setQueue(q => q.slice(1));
        lastFocus.current?.focus?.();
    };

    useEffect(() => {
        if (!cur) return;
        lastFocus.current = document.activeElement as HTMLElement | null;
        setValue(cur.input?.initial || '');
        if (cur.input) setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
        else (cur.danger ? cancelRef : okRef).current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
            // El foco no sale del diálogo: solo hay dos botones.
            if (e.key === 'Tab') {
                e.preventDefault();
                const order = [inputRef.current, cancelRef.current, okRef.current].filter(Boolean) as HTMLElement[];
                const i = order.indexOf(document.activeElement as HTMLElement);
                order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cur]);

    if (!cur) return null;
    const L = LABELS[lang()] || LABELS.es;
    const paragraphs = cur.message.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

    return createPortal(
        <div
            className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 bg-titanium-950/70 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
            onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="mw-confirm-title"
                aria-describedby="mw-confirm-msg"
                className="w-full max-w-[420px] rounded-2xl border border-titanium-700 bg-titanium-900 shadow-[0_30px_80px_rgba(0,0,0,0.55)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-150"
            >
                <div className="flex gap-4 px-5 pt-5">
                    <div className="shrink-0 -mt-1 -ml-1" aria-hidden="true">
                        <MiraSprite pose={cur.danger ? 'preocupada' : 'pensativa'} face />
                    </div>
                    <div className="min-w-0 pt-0.5">
                        <h2 id="mw-confirm-title" className="font-serif text-[17px] leading-snug text-titanium-50">{cur.title || L.title}</h2>
                        <div id="mw-confirm-msg" className="mt-1.5 space-y-2 text-[13.5px] leading-relaxed text-titanium-300">
                            {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
                        </div>
                        {cur.input && (
                            <label className="mt-3 block">
                                {cur.input.label && <span className="mb-1 block text-[12px] text-titanium-400">{cur.input.label}</span>}
                                <input
                                    ref={inputRef}
                                    value={value}
                                    onChange={e => setValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); close(true); } }}
                                    placeholder={cur.input.placeholder}
                                    aria-label={cur.input.label || cur.title || cur.message}
                                    autoComplete="off"
                                    className="w-full rounded-lg border border-titanium-700 bg-titanium-950 px-3 py-2 text-[14px] text-titanium-50 outline-none focus:border-[var(--mw-coral)]"
                                />
                            </label>
                        )}
                    </div>
                </div>
                <div className="mt-5 flex flex-col-reverse gap-2 px-5 pb-5 sm:flex-row sm:justify-end">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={() => close(false)}
                        className="min-h-[40px] rounded-lg px-4 text-[13px] text-titanium-300 hover:bg-titanium-800 hover:text-titanium-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titanium-300"
                    >
                        {cur.cancel || L.cancel}
                    </button>
                    <button
                        ref={okRef}
                        type="button"
                        onClick={() => close(true)}
                        className={`min-h-[40px] rounded-lg px-4 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${cur.danger
                            ? 'bg-red-500/90 text-white hover:bg-red-500 focus-visible:outline-red-300'
                            : 'bg-[var(--mw-coral)] text-[var(--mw-on-coral)] hover:brightness-110 focus-visible:outline-[var(--mw-coral)]'}`}
                    >
                        {cur.confirm || L.ok}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
