// Oct 2026: «Qué pasaría si» — el espacio no canon del Arquitecto (antes: el Laboratorio de ideas).
// El autor juega con ideas sin compromiso, mezclando sus referencias (anime, series, libros de Recursos).
// Nada de aquí entra al canon: las ideas que quiere conservar se guardan como notas en
// Recursos/«Ideas (no canon)» de su Drive, que también ve en Obsidian.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { TaskType } from "@google/generative-ai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_SONNET, CLAUDE_HAIKU, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext } from "./utils/memory_store";
import { getAIKey } from "./utils/security";
import { GeminiEmbedder } from "./utils/vector_utils";
import { ingestFile } from "./ingestion";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

export const IDEAS_FOLDER = "Ideas (no canon)";
const FOLDER = "application/vnd.google-apps.folder";
const MAX_SAVED = 60;

const WHATIF_SYSTEM = `Eres el compañero de imaginación de MyWorld en el espacio «Qué pasaría si». Aquí NADA es canon: el autor juega con ideas para su mundo sin compromiso, y tú juegas con él.
CÓMO TRABAJAS:
- Toma la idea del autor y llévala más lejos: propón 2 o 3 variaciones concretas y distintas entre sí (no tres versiones de lo mismo).
- Mezcla con lo que le gusta: sus referencias (series, anime, películas, libros) y su propio mundo. Cuando uses un ingrediente de una referencia, di de cuál viene y qué tomas de ella (un recurso, una dinámica, una imagen), nunca copies su trama.
- Pregunta lo que le emociona y qué le haría sentir al lector. Una pregunta buena vale más que cinco.
- No escribes la prosa de su libro. Puedes dar ideas en viñetas, escenas en esquema, imágenes sueltas, diálogos de una línea como ejemplo.
- Si una idea chocaría con su canon, dilo en UNA línea al final, como dato y sin frenarlo («Ojo: en tu canon…»). Aquí la regla es imaginar.
- Breve y vivo: unas 200 palabras salvo que pida más. Nada de listas eternas.
- Cuando en la conversación haya una idea con forma, termina con una línea «Idea: <título corto>» para que pueda guardarla.`;

const DISTILL_TASK = `Convierte esta conversación del espacio «Qué pasaría si» en una nota de idea para el autor (no canon).
REGLAS:
- La idea es del autor: usa sus palabras cuando las haya. Lo que propuso la IA y el autor aceptó, va como parte de la idea; lo que la IA propuso y el autor no tomó, NO va (o va en «Variaciones sin decidir» si el autor mostró interés).
- Nada de prosa literaria: viñetas claras.
FORMATO: responde SOLO JSON {"titulo":"…(máx 8 palabras)","cuerpo":"markdown con estas secciones si aplican: ## La idea / ## Ingredientes (de qué referencias sale) / ## Variaciones sin decidir / ## Preguntas abiertas / ## Si algún día entra al canon (qué tendría que cambiar)"}`;

function drv(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

async function getConfig(uid: string): Promise<any> {
    return (await getFirestore().collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
}

async function findIdeasFolder(drive: any, uid: string, create: boolean): Promise<{ id: string; rootId: string } | null> {
    const cfg = await getConfig(uid);
    const rootId: string | undefined = (cfg.resourcePaths || [])[0]?.id;
    if (!rootId) {
        if (create) throw new HttpsError("failed-precondition", "No tienes una carpeta de Recursos configurada. Agrégala en Ajustes → Proyecto.");
        return null;
    }
    const q = `'${rootId}' in parents and name = '${IDEAS_FOLDER}' and mimeType = '${FOLDER}' and trashed = false`;
    const res = await drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
    const found = res.data.files?.[0];
    if (found?.id) return { id: found.id, rootId };
    if (!create) return null;
    const made = await drive.files.create({ requestBody: { name: IDEAS_FOLDER, mimeType: FOLDER, parents: [rootId] }, fields: "id" });
    const now = new Date().toISOString();
    await getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(made.data.id!).set({
        name: IDEAS_FOLDER, path: IDEAS_FOLDER, saga: "Global", parentId: rootId, category: "reference",
        lastIndexed: now, updatedAt: now, driveId: made.data.id, mimeType: FOLDER, type: "folder",
    }, { merge: true });
    logger.info(`💡 [WHATIF] Carpeta «${IDEAS_FOLDER}» creada en Recursos`);
    return { id: made.data.id!, rootId };
}

function sessionRef(uid: string) {
    return getFirestore().collection("users").doc(uid).collection("whatif").doc("session");
}

async function referenceList(uid: string): Promise<{ id: string; name: string; path: string }[]> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").where("category", "==", "reference").limit(200).get();
    return snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((f: any) => f.type !== "folder" && f.mimeType !== FOLDER)
        .map((f: any) => ({ id: f.id, name: String(f.name || "").replace(/\.md$/i, ""), path: String(f.path || "") }));
}

async function canonPeek(uid: string, text: string, requestData: any): Promise<string> {
    try {
        const embedder = new GeminiEmbedder({ apiKey: getAIKey(requestData, googleApiKey.value()), model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_QUERY });
        const v = await embedder.embedQuery(text.slice(0, 1500));
        const snap = await getFirestore().collectionGroup("chunks").where("userId", "==", uid)
            .where("path", ">=", "").where("path", "<=", "\uf8ff")
            .findNearest({ vectorField: "embedding", queryVector: v, limit: 8, distanceMeasure: "COSINE" }).get();
        const out: string[] = [];
        let chars = 0;
        for (const d of snap.docs) {
            const c: any = d.data();
            if (c.category === "reference") continue;
            const t = String(c.text || "").trim();
            if (!t || chars + t.length > 5000) continue;
            chars += t.length;
            out.push(`(${String(c.fileName || "").replace(/\.md$/i, "")}) ${t}`);
        }
        return out.join("\n\n");
    } catch (e: any) {
        logger.warn(`[WHATIF] Sin canon de apoyo: ${e?.message}`);
        return "";
    }
}

export const whatIf = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 180, memory: "512MiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, accessToken } = request.data || {};
        const ref = sessionRef(uid);

        if (mode === "load") {
            const [snap, refs] = await Promise.all([ref.get(), referenceList(uid)]);
            return { messages: (snap.data() as any)?.messages || [], references: refs.filter(r => !r.path.startsWith(IDEAS_FOLDER + "/")) };
        }

        if (mode === "reset") {
            await ref.set({ messages: [], updatedAt: new Date().toISOString() });
            return { messages: [] };
        }

        if (mode === "listIdeas") {
            if (!accessToken) return { ideas: [] };
            const drive = drv(accessToken);
            const folder = await findIdeasFolder(drive, uid, false);
            if (!folder) return { ideas: [] };
            const res = await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: "files(id,name,modifiedTime)", orderBy: "modifiedTime desc", pageSize: 100 });
            return { ideas: (res.data.files || []).map((f: any) => ({ id: f.id, name: String(f.name || "").replace(/\.md$/i, ""), modifiedTime: f.modifiedTime })) };
        }

        if (!claudeEnabledForCurrentUser()) {
            throw new HttpsError("failed-precondition", "«Qué pasaría si» usa Claude y todavía no está activo para tu cuenta.");
        }

        if (mode === "send") {
            const message = String(request.data?.message || "").trim().slice(0, 4000);
            if (!message) throw new HttpsError("invalid-argument", "Escribe algo para empezar.");
            const selected: string[] = Array.isArray(request.data?.refIds) ? request.data.refIds.slice(0, 3) : [];
            const snap = await ref.get();
            const history: { role: "user" | "assistant"; text: string; at: string }[] = (snap.data() as any)?.messages || [];

            const refs = await referenceList(uid);
            let refText = "";
            if (selected.length && accessToken) {
                const drive = drv(accessToken);
                const parts: string[] = [];
                for (const id of selected) {
                    try {
                        const r = refs.find(x => x.id === id);
                        const t = String(await _getDriveFileContentInternal(drive, id) || "").trim().slice(0, 3500);
                        if (t) parts.push(`### ${r?.name || id}\n${t}`);
                    } catch { /* ilegible */ }
                }
                refText = parts.join("\n\n");
            }
            const recent = history.slice(-12);
            const convoHint = recent.map(m => m.text).join(" ").slice(-1500) + " " + message;
            const [memory, canon] = await Promise.all([
                getMemoryContext(uid, convoHint),
                canonPeek(uid, convoHint, request.data),
            ]);
            const context = [
                memory ? `SU MUNDO (memoria del proyecto):\n${memory}` : "",
                canon ? `FRAGMENTOS DE SU CANON (solo para avisar choques, no para limitar):\n${canon}` : "",
                refText ? `REFERENCIAS QUE ELIGIÓ PARA ESTA CONVERSACIÓN:\n${refText}` : "",
                refs.length ? `SUS REFERENCIAS EN RECURSOS (nombres): ${refs.filter(r => !r.path.startsWith(IDEAS_FOLDER + "/")).map(r => r.name).slice(0, 60).join(", ")}` : "",
            ].filter(Boolean).join("\n\n");
            const convo = recent.map(m => `${m.role === "user" ? "AUTOR" : "TÚ"}: ${m.role === "assistant" && m.text.length > 1500 ? m.text.slice(0, 1500) + " […]" : m.text}`).join("\n\n");

            const r = await callClaude({
                model: CLAUDE_SONNET,
                system: [{ text: WHATIF_SYSTEM + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }],
                content: [{ type: "text", text: [context, convo ? `CONVERSACIÓN HASTA AHORA:\n${convo}` : "", `AUTOR: ${message}`].filter(Boolean).join("\n\n") }],
                maxTokens: 3000,
                effort: "low",
                label: "WhatIf",
            } as any);
            if (!r.ok || !r.text) {
                if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
                throw new HttpsError("internal", "No pude responder. Intenta de nuevo.");
            }
            const now = new Date().toISOString();
            const messages = [...history, { role: "user" as const, text: message, at: now }, { role: "assistant" as const, text: r.text.trim(), at: now }].slice(-MAX_SAVED);
            await ref.set({ messages, updatedAt: now });
            return { messages };
        }

        if (mode === "distill") {
            const snap = await ref.get();
            const history: { role: string; text: string }[] = (snap.data() as any)?.messages || [];
            if (!history.length) throw new HttpsError("failed-precondition", "Todavía no hay conversación que guardar.");
            const upTo = Number.isInteger(request.data?.upTo) ? request.data.upTo : history.length - 1;
            const slice = history.slice(Math.max(0, upTo - 11), upTo + 1);
            const r = await callClaude({
                model: CLAUDE_HAIKU,
                system: [{ text: DISTILL_TASK, cache: true }],
                content: [{ type: "text", text: slice.map(m => `${m.role === "user" ? "AUTOR" : "IA"}: ${m.text}`).join("\n\n") + "\n\nResponde SOLO con el JSON." }],
                maxTokens: 3000,
                effort: "low",
                label: "WhatIfDistill",
            } as any);
            if (!r.ok || !r.text) throw new HttpsError("internal", "No pude preparar la nota. Intenta de nuevo.");
            try {
                const j = r.text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
                const p = JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1));
                return { titulo: String(p.titulo || "Idea sin título").slice(0, 80), cuerpo: String(p.cuerpo || "") };
            } catch {
                throw new HttpsError("internal", "La nota llegó mal formada. Intenta de nuevo.");
            }
        }

        if (mode === "saveIdea") {
            if (!accessToken) throw new HttpsError("failed-precondition", "Falta la conexión con Drive. Recarga la página.");
            const titulo = String(request.data?.titulo || "").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Idea sin título";
            const cuerpo = String(request.data?.cuerpo || "").trim();
            if (!cuerpo) throw new HttpsError("invalid-argument", "La idea está vacía.");
            const drive = drv(accessToken);
            const folder = (await findIdeasFolder(drive, uid, true))!;
            const today = new Date().toISOString().slice(0, 10);
            const content = `---\ntipo: idea\ncanon: no\ncreada: ${today}\norigen: Qué pasaría si (MyWorld)\n---\n\n# ${titulo}\n\n${cuerpo}\n`;
            const made = await drive.files.create({
                requestBody: { name: `${titulo}.md`, mimeType: "text/markdown", parents: [folder.id] },
                media: { mimeType: "text/markdown", body: content },
                fields: "id,name,modifiedTime",
            });
            // Indexar ya (como Recurso) para que el Director y el Arquitecto la conozcan sin esperar a la sincronización.
            try {
                const cfg = await getConfig(uid);
                const embedder = new GeminiEmbedder({ apiKey: getAIKey(request.data, googleApiKey.value()), model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_DOCUMENT });
                await ingestFile(getFirestore(), uid, cfg.folderId || "unknown_project", {
                    id: made.data.id!, name: made.data.name!, path: `${IDEAS_FOLDER}/${made.data.name}`, saga: "Global",
                    parentId: folder.id, category: "reference", mimeType: "text/markdown",
                } as any, content, embedder);
            } catch (e: any) {
                logger.warn(`[WHATIF] Idea guardada pero sin indexar aún: ${e?.message}`);
            }
            logger.info(`💡 [WHATIF] Idea guardada: ${made.data.name}`);
            return { idea: { id: made.data.id, name: titulo, modifiedTime: made.data.modifiedTime } };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
