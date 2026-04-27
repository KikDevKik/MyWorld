import { getFirestore, FieldValue } from "firebase-admin/firestore";

export class EntityRepository {
    /**
     * Obtiene la referencia a la colección de entidades de un usuario.
     */
    static getCollection(userId: string) {
        return getFirestore().collection("users").doc(userId).collection("WorldEntities");
    }

    /**
     * Operación Upsert (Actualizar o Insertar) para una WorldEntity.
     * Centraliza la escritura hacia el nuevo paradigma ECS.
     */
    static async upsertEntity(userId: string, entityId: string, payload: Partial<any>) {
        const ref = this.getCollection(userId).doc(entityId);
        
        const safePayload: any = {
            ...payload,
            updatedAt: new Date().toISOString()
        };

        // Si no existe createdAt en la base de datos, Firestore lo creará al no usar merge completo
        // pero preferimos inyectarlo si sabemos que es una creación nueva.
        if (payload.createdAt) {
            safePayload.createdAt = payload.createdAt;
        }

        // Merge true permite actualizar solo los componentes (módulos) modificados
        await ref.set(safePayload, { merge: true });
        return ref;
    }

    /**
     * Actualiza solo el campo psychology de modules.forge.
     * Operación segura: no toca summary, aliases, tags ni otros módulos.
     */
    static async updatePsychology(
        userId: string,
        entityId: string,
        psychology: Record<string, string>
    ): Promise<void> {
        const ref = this.getCollection(userId).doc(entityId);
        await ref.set({
            'modules.forge.psychology': psychology,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    }

    /**
     * Agrega una lesión al physicalState sin sobreescribir lesiones anteriores.
     */
    static async addInjury(
        userId: string,
        entityId: string,
        injury: {
            description: string;
            chapterIntroduced: string;
            mechanicalImpact: string;
        }
    ): Promise<void> {
        const { FieldValue } = await import('firebase-admin/firestore');
        const ref = this.getCollection(userId).doc(entityId);
        
        const newInjury = {
            id: require('crypto').randomUUID(),
            ...injury,
            isResolved: false
        };

        await ref.set({
            'modules.forge.physicalState.injuries': FieldValue.arrayUnion(newInjury),
            'modules.forge.physicalState.currentStatus': 'injured',
            updatedAt: new Date().toISOString()
        }, { merge: true });
    }
}
