// Nov 2026: «Borrar mis datos». Borra todo lo que MyWorld guarda del autor en sus servidores:
// el índice de búsqueda (fragmentos y vectores de su texto), la memoria, las conversaciones, los reportes,
// el plan, las fichas del fichero, el mapa, las ideas y los certificados públicos de autoría.
// NO toca su Google Drive: sus archivos son suyos y siguen ahí.
// Se conserva solo el registro de gasto de IA por mes (users/{uid}/ai_usage): es contabilidad del servicio,
// no contiene texto del autor, y evita que borrar los datos reinicie el tope mensual.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";

const KEEP = new Set(["ai_usage"]);

export const deleteMyData = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, timeoutSeconds: 540, memory: "1GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        if (request.data?.confirm !== "BORRAR") throw new HttpsError("failed-precondition", "Falta la confirmación.");
        const uid = request.auth.uid;
        const db = getFirestore();
        const borrado: string[] = [];

        const userRef = db.collection("users").doc(uid);
        for (const col of await userRef.listCollections()) {
            if (KEEP.has(col.id)) continue;
            await db.recursiveDelete(col);
            borrado.push(col.id);
        }
        await userRef.delete().catch(() => { /* puede no existir */ });

        for (const top of ["TDB_Index", "TDB_Timeline"]) {
            await db.recursiveDelete(db.collection(top).doc(uid));
            borrado.push(top);
        }

        const certs = await db.collection("public_certificates").where("userId", "==", uid).get();
        for (const d of certs.docs) await d.ref.delete();
        if (certs.size) borrado.push(`public_certificates (${certs.size})`);

        logger.info(`[DELETE_MY_DATA] ${uid}: ${borrado.join(", ")}`);
        return { ok: true, borrado };
    }
);
