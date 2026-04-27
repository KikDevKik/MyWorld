import './admin';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { defineSecret } from "firebase-functions/params";
import { FUNCTIONS_REGION, ALLOWED_ORIGINS } from "./config";
import * as logger from "firebase-functions/logger";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

export const backfillResourcesFromDrive = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        secrets: [googleApiKey],
        timeoutSeconds: 540,
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const { accessToken } = request.data;
        if (!accessToken) throw new HttpsError("invalid-argument", "AccessToken requerido.");

        const userId = request.auth.uid;
        const db = getFirestore();

        const configSnap = await db
            .collection("users").doc(userId)
            .collection("profile").doc("project_config")
            .get();

        if (!configSnap.exists) throw new HttpsError("not-found", "Config no encontrada.");

        const config = configSnap.data() || {};
        const resourcePaths: Array<{ id: string; name: string }> = config.resourcePaths || [];
        const projectId: string = config.folderId || "unknown";

        if (resourcePaths.length === 0) {
            return { success: true, processed: 0, message: "No hay carpetas de recursos." };
        }

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        const allFiles: any[] = [];
        let foldersToProcess = resourcePaths.map(p => ({ id: p.id, name: p.name }));

        // Recursividad (Deep Scan)
        while (foldersToProcess.length > 0) {
            const currentFolder = foldersToProcess.shift()!;
            try {
                let pageToken = undefined;
                do {
                    const res: any = await drive.files.list({
                        q: `'${currentFolder.id}' in parents and trashed = false`,
                        fields: "nextPageToken, files(id, name, mimeType)",
                        pageSize: 100,
                        pageToken: pageToken
                    });

                    pageToken = res.data.nextPageToken;
                    const items = res.data.files || [];

                    for (const item of items) {
                        if (item.mimeType === 'application/vnd.google-apps.folder') {
                            foldersToProcess.push({ id: item.id, name: item.name });
                        } else {
                            allFiles.push(item);
                        }
                    }
                } while (pageToken);

                logger.info(`[BACKFILL] Carpeta escaneada: ${currentFolder.name}. Archivos acumulados: ${allFiles.length}`);
            } catch (e) {
                logger.error(`[BACKFILL] Error listando ${currentFolder.id}:`, e);
            }
        }

        if (allFiles.length === 0) {
            return { success: true, processed: 0, message: "Carpetas de recursos vacías en Drive." };
        }

        let processed = 0;
        let skipped = 0;

        // Operaciones por Lotes en BD (Batch) para acelerar escritura y no agotar Rate Limits
        const batchArray: FirebaseFirestore.WriteBatch[] = [];
        batchArray.push(db.batch());
        let operationCounter = 0;
        let batchIndex = 0;

        for (const file of allFiles) {
            const entityRef = db
                .collection("users").doc(userId)
                .collection("WorldEntities").doc(file.id);

            const existing = await entityRef.get();
            if (existing.exists) {
                // Si existe pero está activo o si falló antes, podríamos decidir qué hacer.
                // Aquí sólo registramos los nuevos como pending, si ya existe no pisamos posibles tags.
                skipped++;
                continue;
            }

            batchArray[batchIndex].set(entityRef, {
                id: file.id,
                projectId,
                driveFileId: file.id,
                name: file.name,
                driveFileName: file.name, // 🟢 KAISEN: Persist original name
                category: 'RESOURCE',
                tier: 'ANCHOR', 
                status: 'pending', 
                modules: {
                    forge: {
                        summary: "Esperando destilación...",
                        tags: [],
                    }
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }, { merge: true });

            operationCounter++;
            processed++;

            if (operationCounter === 450) {
                batchArray.push(db.batch());
                batchIndex++;
                operationCounter = 0;
            }
        }

        // Commit todos los batches
        for (const batch of batchArray) {
            await batch.commit();
        }

        logger.info(`[BACKFILL] ✅ Completado. Total de archivos: ${allFiles.length}. Nuevos: ${processed}. Omitidos (ya existían): ${skipped}`);

        return {
            success: true,
            totalFound: allFiles.length,
            processed,
            skipped,
            message: `Completado: ${allFiles.length} detectados, ${processed} ingresados como pending, ${skipped} existentes.`
        };
    }
);