// Oct 2026: Sincronización real entre Drive (Obsidian) y el índice de MyWorld.
// Antes syncSmart era un esqueleto que devolvía 0 cambios: una nota creada en Obsidian no aparecía en
// MyWorld hasta re-indexar todo. Ahora, cada vez que el autor vuelve a la app:
//  - lo nuevo en Drive entra al índice (aparece en el explorador y el Director lo puede citar);
//  - lo editado fuera de MyWorld se re-indexa;
//  - lo borrado sale del índice, con protecciones para no borrar de más.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { TaskType } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { ingestFile, IngestionFile } from "./ingestion";
import { GeminiEmbedder } from "./utils/vector_utils";
import { getAIKey } from "./utils/security";
import { _getDriveFileContentInternal } from "./utils/drive";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const FOLDER = "application/vnd.google-apps.folder";
const MAX_CONTENT_PER_RUN = 25;   // descargas+embeddings por pasada (cuota gratis de embeddings: 100/min)
const MAX_DELETE_RATIO = 0.3;     // si "falta" más del 30 % del índice, algo raro pasa: no se borra nada

function isIndexable(name: string, mimeType: string): boolean {
    return mimeType === "application/vnd.google-apps.document" || mimeType === "text/plain"
        || mimeType === "text/markdown" || mimeType === "text/x-markdown" || /\.(md|txt)$/i.test(name);
}

interface DriveItem extends IngestionFile { modifiedTime?: string }

export const syncSmart = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, timeoutSeconds: 300, memory: "512MiB", secrets: [googleApiKey] },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { accessToken } = request.data || {};
        if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken");
        const uid = request.auth.uid;
        const db = getFirestore();
        const t0 = Date.now();

        const cfg: any = (await db.collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
        const roots: { id: string; category: "canon" | "reference" }[] = [
            ...(cfg.canonPaths || []).map((p: any) => ({ id: p.id, category: "canon" as const })),
            ...(cfg.resourcePaths || []).map((p: any) => ({ id: p.id, category: "reference" as const })),
        ].filter(r => r.id);
        if (!roots.length) return { success: true, added: 0, updated: 0, deleted: 0, pending: 0 };

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        // 1. Recorrer Drive (mismo criterio que "Indexar": carpetas + archivos de texto)
        const items: DriveItem[] = [];
        let listingComplete = true;
        const walk = async (folderId: string, category: "canon" | "reference", parentPath: string, depth: number) => {
            if (depth > 8) return;
            let pageToken: string | undefined;
            do {
                const res: any = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
                    pageSize: 1000, pageToken,
                });
                for (const f of res.data.files || []) {
                    if (!f.id || !f.name) continue;
                    const path = parentPath ? `${parentPath}/${f.name}` : f.name;
                    if (f.mimeType === FOLDER) {
                        items.push({ id: f.id, name: f.name, path, parentId: folderId, category, mimeType: FOLDER, modifiedTime: f.modifiedTime });
                        await walk(f.id, category, path, depth + 1);
                    } else if (isIndexable(f.name, f.mimeType || "")) {
                        items.push({ id: f.id, name: f.name, path, parentId: folderId, category, mimeType: f.mimeType || "text/markdown", modifiedTime: f.modifiedTime });
                    }
                }
                pageToken = res.data.nextPageToken || undefined;
            } while (pageToken);
        };
        for (const r of roots) {
            try { await walk(r.id, r.category, "", 0); }
            catch (e: any) { listingComplete = false; logger.warn(`[SYNC] No se pudo recorrer ${r.id}: ${e?.message}`); }
        }

        // 2. Comparar con el índice
        const filesCol = db.collection("TDB_Index").doc(uid).collection("files");
        const indexSnap = await filesCol.get();
        const indexed = new Map<string, any>(indexSnap.docs.map(d => [d.id, d.data()]));
        const driveIds = new Set(items.map(i => i.id));
        const projectFolderIds = new Set<string>([...roots.map(r => r.id), ...items.filter(i => i.mimeType === FOLDER).map(i => i.id)]);

        const newFolders = items.filter(i => i.mimeType === FOLDER && !indexed.has(i.id));
        const toIngest = items.filter(i => {
            if (i.mimeType === FOLDER) return false;
            const doc = indexed.get(i.id);
            if (!doc) return true;
            const last = doc.lastIndexed ? Date.parse(doc.lastIndexed) : 0;
            const mod = i.modifiedTime ? Date.parse(i.modifiedTime) : 0;
            return mod > last + 60_000; // editado fuera de MyWorld después de la última indexación
        });
        // Borrados: solo lo que claramente era de este proyecto (su carpeta padre sigue en el proyecto).
        const gone = indexSnap.docs.filter(d => {
            const data: any = d.data();
            return !driveIds.has(d.id) && data?.parentId && projectFolderIds.has(data.parentId);
        });

        // 3. Carpetas nuevas (sin descargas)
        let added = 0, updated = 0, deleted = 0;
        for (const f of newFolders) {
            await filesCol.doc(f.id).set({
                name: f.name, path: f.path, saga: "Global", parentId: f.parentId, category: f.category,
                lastIndexed: new Date().toISOString(), updatedAt: new Date().toISOString(),
                driveId: f.id, mimeType: FOLDER, type: "folder",
            }, { merge: true });
            added++;
        }

        // 4. Archivos nuevos o editados (con embeddings si hay clave de Gemini)
        let embedder: any = null;
        try {
            embedder = new GeminiEmbedder({ apiKey: getAIKey(request.data, googleApiKey.value()), model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_DOCUMENT });
        } catch { embedder = null; }
        const batch = toIngest.slice(0, MAX_CONTENT_PER_RUN);
        for (const f of batch) {
            const isNew = !indexed.has(f.id);
            try {
                if (!embedder) {
                    // Sin clave: al menos que aparezca en el explorador; "Indexar" completará el contenido.
                    if (isNew) await filesCol.doc(f.id).set({ name: f.name, path: f.path, saga: "Global", parentId: f.parentId, category: f.category, mimeType: f.mimeType, driveId: f.id, updatedAt: new Date().toISOString() }, { merge: true });
                } else {
                    const content = await _getDriveFileContentInternal(drive, f.id);
                    if (content && content.trim().length >= 10) {
                        await ingestFile(db, uid, cfg.folderId || "decentralized-project", f, content, embedder);
                    } else if (isNew) {
                        await filesCol.doc(f.id).set({ name: f.name, path: f.path, saga: "Global", parentId: f.parentId, category: f.category, mimeType: f.mimeType, driveId: f.id, updatedAt: new Date().toISOString() }, { merge: true });
                    }
                    await filesCol.doc(f.id).set({ lastIndexed: new Date().toISOString() }, { merge: true });
                }
                isNew ? added++ : updated++;
            } catch (e: any) {
                logger.warn(`[SYNC] No se pudo indexar ${f.path}: ${e?.message}`);
            }
        }

        // 5. Borrados (con protecciones)
        if (!listingComplete) {
            logger.warn(`[SYNC] Drive no respondió completo: no borro nada (${gone.length} candidatos).`);
        } else if (gone.length > Math.max(5, indexSnap.size * MAX_DELETE_RATIO)) {
            logger.warn(`[SYNC] ${gone.length} de ${indexSnap.size} archivos "faltan": demasiados, no borro nada por seguridad.`);
        } else {
            for (const d of gone) {
                try {
                    const chunks = await d.ref.collection("chunks").listDocuments();
                    for (let i = 0; i < chunks.length; i += 400) {
                        const wb = db.batch();
                        chunks.slice(i, i + 400).forEach(c => wb.delete(c));
                        await wb.commit();
                    }
                    await d.ref.delete();
                    deleted++;
                } catch (e: any) {
                    logger.warn(`[SYNC] No se pudo quitar ${d.id} del índice: ${e?.message}`);
                }
            }
        }

        const pending = Math.max(0, toIngest.length - batch.length);
        logger.info(`🔄 [SYNC] ${items.length} en Drive · +${added} nuevos · ${updated} actualizados · -${deleted} borrados · ${pending} pendientes · ${Date.now() - t0} ms`);
        return { success: true, added, updated, deleted, pending };
    }
);
