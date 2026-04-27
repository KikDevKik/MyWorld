import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
    getDocs,
    limit,
    Timestamp,
    DocumentData,
    writeBatch
} from 'firebase/firestore';
import { ExtendedChatMessage } from '../components/ChatPanel';

export interface MuseSession {
    id: string;
    userId: string;
    title: string;
    lastActivity: Timestamp;
    createdAt: Timestamp;
    preview: string;
}

export class MuseSessionService {
    private static getSessionsCol(userId: string) {
        return collection(getFirestore(), 'users', userId, 'muse_sessions');
    }

    static async createSession(userId: string, firstMessage: string): Promise<string> {
        const title = firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
        const docRef = await addDoc(this.getSessionsCol(userId), {
            userId,
            title,
            preview: firstMessage.substring(0, 100),
            createdAt: serverTimestamp(),
            lastActivity: serverTimestamp()
        });
        return docRef.id;
    }

    static async saveMessage(userId: string, sessionId: string, message: ExtendedChatMessage) {
        // 🛡️ Filtro de Teflón: los mensajes de error son efímeros (solo UI local).
        // Solo persistimos roles canónicos para mantener la pureza del historial.
        const VALID_ROLES: Array<ExtendedChatMessage['role']> = ['user', 'model'];
        if (!VALID_ROLES.includes(message.role)) {
            console.warn('[MuseSessionService] Mensaje efímero descartado (no persistido):', message.role);
            return;
        }

        const db = getFirestore();
        const msgCol = collection(db, 'users', userId, 'muse_sessions', sessionId, 'messages');

        await addDoc(msgCol, {
            ...message,
            timestamp: serverTimestamp()
        });

        // Update session heartbeat and preview
        const sessionRef = doc(db, 'users', userId, 'muse_sessions', sessionId);
        await updateDoc(sessionRef, {
            lastActivity: serverTimestamp(),
            preview: message.text.substring(0, 100)
        });
    }

    static subscribeToSessions(userId: string, onUpdate: (sessions: MuseSession[]) => void) {
        const q = query(
            this.getSessionsCol(userId),
            orderBy('lastActivity', 'desc'),
            limit(20)
        );

        return onSnapshot(q, (snapshot) => {
            const sessions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as MuseSession));
            onUpdate(sessions);
        });
    }

    static async getMessages(userId: string, sessionId: string): Promise<ExtendedChatMessage[]> {
        const db = getFirestore();
        const msgCol = collection(db, 'users', userId, 'muse_sessions', sessionId, 'messages');
        const q = query(msgCol, orderBy('timestamp', 'asc'));

        const snapshot = await getDocs(q);
        // 🛡️ Filtro de Teflón: al cargar el historial solo se reconstruyen
        // mensajes con roles válidos. Cualquier documento corrupto se descarta.
        const VALID_ROLES = ['user', 'model'];
        return snapshot.docs
            .map(doc => {
                const data = doc.data();
                return {
                    role: data.role,
                    text: data.text,
                    sources: data.sources,
                    contextFiles: data.contextFiles,
                    attachmentPreview: data.attachmentPreview,
                    attachmentType: data.attachmentType
                } as ExtendedChatMessage;
            })
            .filter(msg => VALID_ROLES.includes(msg.role));
    }

    static async deleteSession(userId: string, sessionId: string) {
        const db = getFirestore();
        const sessionRef = doc(db, 'users', userId, 'muse_sessions', sessionId);
        const msgCol = collection(db, 'users', userId, 'muse_sessions', sessionId, 'messages');

        // 🔥 DEEP DELETE: Firestore no borra subcolecciones en cascada.
        // Limpiamos todos los mensajes primero para no dejar datos huérfanos.
        const msgSnap = await getDocs(msgCol);
        if (!msgSnap.empty) {
            const batch = writeBatch(db);
            msgSnap.docs.forEach(msgDoc => batch.delete(msgDoc.ref));
            await batch.commit();
        }

        // Borrar el documento padre una vez que la subcolección está vacía.
        await deleteDoc(sessionRef);
    }
}
