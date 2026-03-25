import {
    getFirestore,
    collection,
    query,
    where,
    onSnapshot,
    Unsubscribe,
    Query,
    DocumentData,
} from 'firebase/firestore';
import { WorldEntity, EntityTier } from '../types/entity';

/**
 * ============================================================
 *  EntityService — Unified Knowledge Graph
 *  Colección Firestore: users/{userId}/WorldEntities/{entityId}
 *
 *  Principios:
 *  - Un único servicio, una única colección plana por usuario.
 *  - El userId define el "tenant"; projectId filtra el proyecto activo.
 *  - Devuelve siempre WorldEntity[] para que los mappers de la UI
 *    conviertan al tipo legado que necesiten (SoulEntity, GraphNode…).
 * ============================================================
 */
export class EntityService {

    // ── HELPERS ──────────────────────────────────────────────────────────────

    /**
     * Devuelve la referencia base a la colección unificada del usuario.
     * Ruta: users/{userId}/WorldEntities
     */
    private static getCollection(userId: string) {
        return collection(getFirestore(), 'users', userId, 'WorldEntities');
    }

    /**
     * Construye una query filtrada por proyecto(s) y uno o más tiers.
     */
    private static buildTierQuery(
        userId: string,
        projectId: string | string[],
        tiers: EntityTier[]
    ): Query<DocumentData> {
        const col = EntityService.getCollection(userId);
        let q = query(col, where('status', '!=', 'archived'));

        // Filtrar por Proyecto (o lista de Proyectos/Sagas)
        if (Array.isArray(projectId)) {
            if (projectId.length > 0) {
                q = query(q, where('projectId', 'in', projectId));
            } else {
                // Si el array está vacío, forzamos que no devuelva nada (o un default)
                q = query(q, where('projectId', '==', 'NONE'));
            }
        } else {
            q = query(q, where('projectId', '==', projectId));
        }

        // Filtrar por Tier
        if (tiers.length === 1) {
            q = query(q, where('tier', '==', tiers[0]));
        } else if (tiers.length > 1) {
            q = query(q, where('tier', 'in', tiers));
        }

        return q;
    }

    // ── SUBSCRIPTIONS ────────────────────────────────────────────────────────

    /**
     * Suscripción reactiva a las entidades ANCHOR (canon confirmado).
     */
    static subscribeToAnchors(
        userId: string,
        projectId: string | string[],
        onUpdate: (entities: WorldEntity[]) => void,
        onError?: (error: unknown) => void
    ): Unsubscribe {
        const q = EntityService.buildTierQuery(userId, projectId, ['ANCHOR']);

        return onSnapshot(q, (snapshot) => {
            const entities: WorldEntity[] = [];
            snapshot.forEach(doc => {
                entities.push({ id: doc.id, ...doc.data() } as WorldEntity);
            });
            onUpdate(entities);
        }, onError);
    }

    /**
     * Suscripción reactiva a entidades detectadas: GHOST y LIMBO.
     */
    static subscribeToDetectedEntities(
        userId: string,
        projectId: string | string[],
        onUpdate: (entities: WorldEntity[]) => void,
        onError?: (error: unknown) => void
    ): Unsubscribe {
        const q = EntityService.buildTierQuery(userId, projectId, ['GHOST', 'LIMBO']);

        return onSnapshot(q, (snapshot) => {
            const entities: WorldEntity[] = [];
            snapshot.forEach(doc => {
                entities.push({ id: doc.id, ...doc.data() } as WorldEntity);
            });
            onUpdate(entities);
        }, onError);
    }

    /**
     * Suscripción al grafo completo (todos los tiers activos).
     */
    static subscribeToAllEntities(
        userId: string,
        projectId: string | string[],
        onUpdate: (entities: WorldEntity[]) => void,
        onError?: (error: unknown) => void
    ): Unsubscribe {
        const q = EntityService.buildTierQuery(userId, projectId, ['ANCHOR', 'GHOST', 'LIMBO']);

        return onSnapshot(q, (snapshot) => {
            const entities: WorldEntity[] = [];
            snapshot.forEach(doc => {
                entities.push({ id: doc.id, ...doc.data() } as WorldEntity);
            });
            onUpdate(entities);
        }, onError);
    }

    // ── CRUD OPERATIONS ────────────────────────────────────────────────────────

    static async updateEntity(userId: string, entityId: string, updates: Partial<WorldEntity>): Promise<void> {
        const { updateDoc, doc } = await import('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'WorldEntities', entityId);
        await updateDoc(ref, updates as DocumentData);
    }

    static async deleteEntity(userId: string, entityId: string): Promise<void> {
        const { deleteDoc, doc } = await import('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'WorldEntities', entityId);
        await deleteDoc(ref);
    }

    static async getEntity(userId: string, entityId: string): Promise<WorldEntity | null> {
        const { getDoc, doc } = await import('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'WorldEntities', entityId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            return { id: snap.id, ...snap.data() } as WorldEntity;
        }
        return null;
    }

    static async saveEntity(userId: string, entityId: string, data: Partial<WorldEntity>): Promise<void> {
        const { setDoc, doc } = await import('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'WorldEntities', entityId);
        await setDoc(ref, data, { merge: true });
    }

    static async findEntityByName(userId: string, projectId: string, name: string): Promise<WorldEntity | null> {
        const { getDocs, limit } = await import('firebase/firestore');
        const q = query(
            EntityService.getCollection(userId),
            where('projectId', '==', projectId),
            where('name', '==', name),
            limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            return { id: snap.docs[0].id, ...snap.docs[0].data() } as WorldEntity;
        }
        return null;
    }

    static async deleteAllProjectEntities(userId: string, projectId: string): Promise<void> {
        const { getDocs, writeBatch } = await import('firebase/firestore');
        const db = getFirestore();
        const q = query(EntityService.getCollection(userId), where('projectId', '==', projectId));
        const snap = await getDocs(q);
        
        const batch = writeBatch(db);
        snap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    // ── SETTINGS OPERATIONS ──────────────────────────────────────────────────

    static async getProjectSettings(userId: string, projectId: string): Promise<DocumentData | null> {
        const { getDoc, doc } = await import('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'projects', projectId, 'settings', 'general');
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : null;
    }

    static async updateProjectSettings(userId: string, projectId: string, updates: DocumentData): Promise<void> {
        const { setDoc, doc } = await import('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'projects', projectId, 'settings', 'general');
        await setDoc(ref, updates, { merge: true });
    }

    static subscribeToProjectSettings(
        userId: string,
        projectId: string,
        onUpdate: (settings: DocumentData | null) => void,
        onError?: (error: unknown) => void
    ): Unsubscribe {
        const { doc, onSnapshot } = require('firebase/firestore');
        const db = getFirestore();
        const ref = doc(db, 'users', userId, 'projects', projectId, 'settings', 'general');
        return onSnapshot(ref, (snap: any) => {
            onUpdate(snap.exists() ? snap.data() : null);
        }, onError);
    }
}