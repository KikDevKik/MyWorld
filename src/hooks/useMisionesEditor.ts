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
        if (!sessionId) return;

        const auth = getAuth();
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const db = getFirestore();
        const roadmapRef = doc(
            db, 'users', uid, 'forge_sessions', sessionId, 'architect', 'roadmapFinal'
        );

        const unsub = onSnapshot(roadmapRef, (snap) => {
            if (!snap.exists()) {
                setHasRoadmap(false);
                setMisiones([]);
                return;
            }

            const data = snap.data();
            const rawMissions: string[] = data.creationMissions || data.missions || [];

            setHasRoadmap(true);

            const completedKey = `missions_completed_${sessionId}`;
            const completedIds: string[] = JSON.parse(
                localStorage.getItem(completedKey) || '[]'
            );

            setMisiones(rawMissions.map((text, i) => ({
                id: `mission_${i}`,
                text,
                completed: completedIds.includes(`mission_${i}`),
            })));
        });

        return () => unsub();
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
