// Nov 2026: estado del tutorial progresivo. Lo aprendido se guarda en la cuenta
// (users/uid/user_state/tour), así no se repite al pasar del PC al celular o a la app del iPhone.
import { create } from 'zustand';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { ROOMS, TIP_BY_ID, RoomId } from './tips';

const MAX_PER_DAY = 4;          // ayudas por día (las pedidas con «Muéstrame» no cuentan)
const COOLDOWN_MS = 45_000;     // entre una ayuda de momento y la siguiente
const LOCAL_KEY = 'mw-tour';

interface Saved { seen: Record<string, string>; disabled: boolean }
interface Day { date: string; count: number; lastAt: number }

interface TourState {
    loaded: boolean;
    seen: Record<string, string>;
    disabled: boolean;
    snoozed: Record<string, true>;   // «Ahora no»: no vuelve en esta sesión
    queue: string[];
    active: string | null;
    forced: boolean;                 // abierta desde «Muéstrame»
    request: (id: string) => void;
    show: (id: string) => void;      // «Muéstrame»: sin límites
    done: () => void;
    snooze: () => void;
    setDisabled: (v: boolean) => void;
    reset: () => void;
    next: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
function readDay(): Day {
    try { const d = JSON.parse(localStorage.getItem(`${LOCAL_KEY}-day`) || 'null'); if (d?.date === today()) return d; } catch { /* */ }
    return { date: today(), count: 0, lastAt: 0 };
}
function writeDay(d: Day) { try { localStorage.setItem(`${LOCAL_KEY}-day`, JSON.stringify(d)); } catch { /* */ } }
const localKey = (uid?: string | null) => uid ? `${LOCAL_KEY}-${uid}` : LOCAL_KEY;
function readLocal(uid?: string | null): Saved {
    try { const s = JSON.parse(localStorage.getItem(localKey(uid)) || 'null'); if (s) return { seen: s.seen || {}, disabled: !!s.disabled }; } catch { /* */ }
    return { seen: {}, disabled: false };
}
function persist(s: Saved) {
    const uid = getAuth().currentUser?.uid;
    try { localStorage.setItem(localKey(uid), JSON.stringify(s)); } catch { /* */ }
    if (uid) setDoc(doc(getFirestore(), 'users', uid, 'user_state', 'tour'), s).catch(() => { /* sin conexión: queda lo local */ });
}

export const useTourStore = create<TourState>((set, get) => ({
    loaded: false,
    seen: {},
    disabled: false,
    snoozed: {},
    queue: [],
    active: null,
    forced: false,

    request: (id) => {
        const s = get();
        if (!TIP_BY_ID[id] || s.seen[id] || s.disabled || s.snoozed[id] || s.active === id || s.queue.includes(id)) return;
        // Las de entrada (abrir un cuarto) van primero; las de momento esperan su turno.
        const queue = TIP_BY_ID[id].entry ? [id, ...s.queue] : [...s.queue, id];
        set({ queue });
        get().next();
    },
    show: (id) => {
        if (!TIP_BY_ID[id]) return;
        set({ active: id, forced: true, queue: get().queue.filter(q => q !== id) });
    },
    next: () => {
        const s = get();
        if (!s.loaded || s.active || s.disabled || !s.queue.length) return;
        const day = readDay();
        if (day.count >= MAX_PER_DAY) return;
        const id = s.queue[0];
        const tip = TIP_BY_ID[id];
        if (!tip.entry && Date.now() - day.lastAt < COOLDOWN_MS) {
            setTimeout(() => get().next(), COOLDOWN_MS - (Date.now() - day.lastAt) + 200);
            return;
        }
        writeDay({ ...day, count: day.count + 1, lastAt: Date.now() });
        set({ active: id, forced: false, queue: s.queue.slice(1) });
    },
    done: () => {
        const s = get();
        if (!s.active) return;
        const seen = { ...s.seen, [s.active]: new Date().toISOString() };
        set({ seen, active: null, forced: false });
        persist({ seen, disabled: s.disabled });
        const d = readDay(); writeDay({ ...d, lastAt: Date.now() });
        setTimeout(() => get().next(), 1500);
    },
    snooze: () => {
        const s = get();
        if (!s.active) return;
        set({ snoozed: { ...s.snoozed, [s.active]: true }, active: null, forced: false });
        setTimeout(() => get().next(), 1500);
    },
    setDisabled: (v) => {
        const s = get();
        set({ disabled: v, active: v ? null : s.active, queue: v ? [] : s.queue });
        persist({ seen: s.seen, disabled: v });
    },
    reset: () => {
        set({ seen: {}, snoozed: {}, queue: [], active: null });
        persist({ seen: {}, disabled: get().disabled });
    },
}));

// Carga lo aprendido desde la cuenta al iniciar sesión (lo local sirve mientras tanto).
let started = false;
export function startTourSync() {
    if (started) return; started = true;
    onAuthStateChanged(getAuth(), async (u) => {
        if (!u) { useTourStore.setState({ loaded: false }); return; }
        try {
            const snap = await getDoc(doc(getFirestore(), 'users', u.uid, 'user_state', 'tour'));
            const remote = snap.exists() ? (snap.data() as Saved) : null;
            const local = readLocal(u.uid);
            const seen = { ...(remote?.seen || {}), ...local.seen };
            const disabled = remote ? !!remote.disabled : local.disabled;
            useTourStore.setState({ seen, disabled, loaded: true });
            if (remote && Object.keys(local.seen).some(k => !remote.seen?.[k])) persist({ seen, disabled });
        } catch {
            useTourStore.setState({ loaded: true });
        }
        useTourStore.getState().next();
    });
}

/** Pide una ayuda cuando el componente aparece (y la condición se cumple). */
export function requestTip(id: string) { useTourStore.getState().request(id); }

export function roomDiscovered(seen: Record<string, string>, room: RoomId): boolean {
    return Object.keys(seen).some(id => TIP_BY_ID[id]?.room === room);
}
export function discoveredCount(seen: Record<string, string>): number {
    return ROOMS.filter(r => roomDiscovered(seen, r.id)).length;
}
