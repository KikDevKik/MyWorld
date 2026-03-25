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
}