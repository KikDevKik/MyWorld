import { useEffect, useState } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export interface Mision {
    id: string;
    text: string;
    completed: boolean;
}

export function useMisionesEditor(sessionId: string | null) {
    const [misiones, setMisiones] = useState<Mision[]>([]);
    const [hasRoadmap, setHasRoadmap] = useState(false);

    useEffect(() => {
        const auth = getAuth();
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const db = getFirestore();
        // Nov 2026: el plan de la sesión actual manda; si no hay, el último plan del proyecto (users/uid/plan/current),
        // para que «Según tu plan, sigue…» no desaparezca al empezar otra conversación.
        let sessionMissions: string[] | null = null;
        let projectMissions: { list: string[]; sessionId?: string } | null = null;
        const apply = () => {
            const list = sessionMissions && sessionMissions.length ? sessionMissions : projectMissions?.list || [];
            const key = sessionMissions && sessionMissions.length ? sessionId : (projectMissions?.sessionId || sessionId);
            setHasRoadmap(list.length > 0);
            const completedKey = `missions_completed_${key}`;
            let completedIds: string[] = [];
            try { completedIds = JSON.parse(localStorage.getItem(completedKey) || '[]'); } catch { /* sin almacenamiento */ }
            setMisiones(list.map((text, i) => ({ id: `mission_${i}`, text, completed: completedIds.includes(`mission_${i}`) })));
        };
        const unsubs: (() => void)[] = [];
        unsubs.push(onSnapshot(doc(db, 'users', uid, 'plan', 'current'), (snap) => {
            const d: any = snap.exists() ? snap.data() : null;
            projectMissions = d ? { list: d.missions || [], sessionId: d.sessionId } : null;
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
    }, [sessionId]);

    const toggleMision = (id: string) => {
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
