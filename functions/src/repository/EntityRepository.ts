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
}
