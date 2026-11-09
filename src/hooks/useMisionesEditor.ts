import { useEffect, useState } from 'react';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export interface Mision {
    id: string;
    text: string;
    completed: boolean;
}

export function useMisionesEditor(sessionId: string | null) {
    const [misiones, setMisiones] = useState<Mision[]>([]);
    const [hasRoadmap, setHasRoadmap] = useState(false);
    // Nov 2026: si la lista viene del plan del proyecto, lo hecho se guarda allí (y lo marca también el reporte del capítulo).
    const [fromProject, setFromProject] = useState(false);

    // Nov 2026: al abrir la app la sesión de Firebase todavía no está lista; antes el hook no se suscribía nunca
    // y el escritorio decía «Todavía no tenemos un plan» aunque hubiera misiones guardadas.
    const [uid, setUid] = useState<string | null>(() => getAuth().currentUser?.uid || null);
    useEffect(() => onAuthStateChanged(getAuth(), u => setUid(u?.uid || null)), []);

    useEffect(() => {
        if (!uid) return;
        const db = getFirestore();
        // Nov 2026: el plan de la sesión actual manda; si no hay, el último plan del proyecto (users/uid/plan/current),
        // para que «Según tu plan, sigue…» no desaparezca al empezar otra conversación.
        let sessionMissions: string[] | null = null;
        let projectMissions: { list: string[]; sessionId?: string; done: number[] } | null = null;
        const apply = () => {
            const useSession = !!(sessionMissions && sessionMissions.length);
            const list = useSession ? sessionMissions! : projectMissions?.list || [];
            const key = useSession ? sessionId : (projectMissions?.sessionId || sessionId);
            setHasRoadmap(list.length > 0);
            setFromProject(!useSession && list.length > 0);
            const completedKey = `missions_completed_${key}`;
            let completedIds: string[] = [];
            try { completedIds = JSON.parse(localStorage.getItem(completedKey) || '[]'); } catch { /* sin almacenamiento */ }
            const doneRemote = !useSession ? (projectMissions?.done || []) : [];
            setMisiones(list.map((text, i) => ({ id: `mission_${i}`, text, completed: completedIds.includes(`mission_${i}`) || doneRemote.includes(i) })));
        };
        const unsubs: (() => void)[] = [];
        unsubs.push(onSnapshot(doc(db, 'users', uid, 'plan', 'current'), (snap) => {
            const d: any = snap.exists() ? snap.data() : null;
            projectMissions = d ? { list: d.missions || [], sessionId: d.sessionId, done: Array.isArray(d.done) ? d.done.map(Number) : [] } : null;
            apply();
        }, () => { /* sin permiso o sin plan */ }));
        if (sessionId) {
            unsubs.push(onSnapshot(doc(db, 'users', uid, 'forge_sessions', sessionId, 'architect', 'roadmapFinal'), (snap) => {
                const data: any = snap.exists() ? snap.data() : null;
                sessionMissions = data ? (data.creationMissions || data.missions || []) : null;
                apply();
            }));
        }
        return () => unsubs.forEach(u => u());
    }, [sessionId, uid]);

    const toggleMision = (id: string) => {
        if (fromProject) {
            const uid = getAuth().currentUser?.uid;
            const i = Number(id.replace('mission_', ''));
            const cur = misiones.find(m => m.id === id);
            if (uid && cur && Number.isInteger(i)) {
                setMisiones(prev => prev.map(m => m.id === id ? { ...m, completed: !m.completed } : m));
                updateDoc(doc(getFirestore(), 'users', uid, 'plan', 'current'), { done: cur.completed ? arrayRemove(i) : arrayUnion(i) }).catch(() => { /* sin conexión */ });
                return;
            }
        }
        if (!sessionId) return;
        setMisiones(prev => {
            const updated = prev.map(m =>
                m.id === id ? { ...m, completed: !m.completed } : m
            );
            const completedKey = `missions_completed_${sessionId}`;
            const completedIds = updated.filter(m => m.completed).map(m => m.id);
            localStorage.setItem(completedKey, JSON.stringify(completedIds));
            return updated;
        });
    };

    const resetProgress = () => {
        if (!sessionId) return;
        const completedKey = `missions_completed_${sessionId}`;
        localStorage.removeItem(completedKey);
        setMisiones(prev => prev.map(m => ({ ...m, completed: false })));
    };

    const pendingCount = misiones.filter(m => !m.completed).length;

    return { misiones, hasRoadmap, toggleMision, resetProgress, pendingCount };
}
