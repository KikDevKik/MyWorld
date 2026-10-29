// Oct 2026: El Arquitecto, modo «Conectar» (el modo por defecto).
// Para antes de escribir: el autor tiene ideas sueltas o un mundo establecido y no sabe cómo conectarlo.
// Una sola llamada a Claude por mensaje (antes: 3 clasificadores + respuesta), con su canon citado por
// archivo, su memoria y la conversación. Al cerrar, resume: ideas sueltas, conexiones decididas,
// lo que falta decidir y una escena que ya puede escribir (y lo guarda en Recursos para Obsidian).
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { TaskType } from "@google/generative-ai";
import { HttpsError } from "firebase-functions/v2/https";
import { callClaude, claudeEnabledForCurrentUser, CLAUDE_SONNET, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext } from "./utils/memory_store";
import { GeminiEmbedder } from "./utils/vector_utils";

const FOLDER = "application/vnd.google-apps.folder";
export const SESSIONS_FOLDER = "Sesiones del Arquitecto";

/** Auditoría (disonancias) solo si el autor lo pide; todo lo demás es conectar. */
export function wantsAudit(goal: string): boolean {
    return /(inconsisten|contradic|consistencia|auditor|lagunas?|huecos? l[oó]gic|disonanc|errores? (de|en) (mi )?(mundo|lore|sistema))/i.test(goal || "");
}

export function connectAvailable(): boolean {
    return claudeEnabledForCurrentUser();
}

const CONECTAR_SYSTEM = `Eres El Arquitecto de MyWorld. El autor viene ANTES de escribir: tiene una idea nueva, varias ideas sueltas o un mundo ya establecido, y no sabe cómo conectarlo todo. Tu trabajo es ayudarle a ver las conexiones que ya existen en su material y a decidir las que faltan. Él decide; tú preguntas, muestras y ordenas.

CÓMO TRABAJAS:
1. Conoces su material. Apóyate en los fragmentos de su canon, su memoria y el mapa de sus archivos. Cuando conectes dos piezas, nombra de qué archivo sale cada una («en Errantes dices…; en Letum…»). Nunca inventes hechos de su mundo: si algo no está en su material, pregúntalo.
2. Haz como mucho 2 preguntas por mensaje, y que sean de las que él no se haría solo: las que cruzan dos piezas de su mundo, revelan una consecuencia o le obligan a elegir.
3. Presenta cada conexión como hipótesis con su consecuencia («Si X está ligado a Y, entonces Z. ¿Te sirve o te rompe algo?»). Si está atascado, ofrece 2 o 3 caminos distintos con lo que gana y lo que pierde cada uno.
4. Cuida el miedo al retcon: si una decisión afecta libros o eras futuras, dilo y propón cómo dejarla abierta sin comprometerse todavía.
5. Nunca escribes su trama ni su prosa. Puedes ordenar, resumir lo que ya decidió y señalar lo que falta decidir.
6. Si lo que quiere es jugar sin compromiso, sugiérele la pestaña «Qué pasaría si»; si quiere completar la ficha de un personaje, la pestaña «Personajes».
7. Breve y claro: entre 120 y 300 palabras. Sin títulos innecesarios. Termina con tu pregunta.`;

const CLOSE_TASK = `El autor cierra esta sesión con El Arquitecto. Resume SOLO lo que pasó en la conversación, en markdown, con estas secciones (omite las vacías):
## Ideas sueltas
(lo que apareció y no se conectó todavía)
## Conexiones que decidiste
(SOLO lo que el autor aceptó o afirmó; con sus palabras cuando se pueda)
## Por decidir
(las preguntas abiertas más importantes, máximo 5)
## Una escena que ya puedes escribir
(UNA escena concreta que, con lo decidido, ya se puede escribir: quién, dónde, qué cambia. En una o dos frases; sin prosa)
No agregues nada que el autor no haya dicho o aceptado en Conexiones. Breve.`;

function drv(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

/** Mapa de su material: nombres de archivos del canon por carpeta (barato, sin leer contenido). */
async function worldMap(uid: string): Promise<string> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").limit(600).get();
    const groups: Record<string, string[]> = {};
    for (const d of snap.docs) {
        const f: any = d.data();
        if (f.type === "folder" || f.mimeType === FOLDER) continue;
        const path = String(f.path || f.name || "");
        const top = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : (f.category === "reference" ? "Recursos" : "Raíz");
        const label = `${f.category === "reference" ? "[Recursos] " : ""}${top}`;
        (groups[label] ||= []).push(String(f.name || "").replace(/\.md$/i, ""));
    }
    const lines = Object.keys(groups).sort().map(k => `- ${k}: ${groups[k].slice(0, 25).join(", ")}${groups[k].length > 25 ? ` (+${groups[k].length - 25})` : ""}`);
    return lines.join("\n").slice(0, 6000);
}

/** Fragmentos de su material parecidos a lo que se habla (canon primero, luego recursos). */
async function relevantMaterial(uid: string, text: string, apiKey: string): Promise<string> {
    try {
        const embedder = new GeminiEmbedder({ apiKey, model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_QUERY });
        const v = await embedder.embedQuery(text.slice(0, 2000));
        const snap = await getFirestore().collectionGroup("chunks").where("userId", "==", uid)
            .where("path", ">=", "").where("path", "<=", "")
            .findNearest({ vectorField: "embedding", queryVector: v, limit: 18, distanceMeasure: "COSINE" }).get();
        const perFile: Record<string, number> = {};
        const seen = new Set<string>();
        const canon: string[] = [], refs: string[] = [];
        let chars = 0;
        for (const d of snap.docs) {
            const c: any = d.data();
            const name = String(c.fileName || "Desconocido").replace(/\.md$/i, "");
            const t = String(c.text || "").trim();
            if (!t || seen.has(t.slice(0, 80))) continue;
            seen.add(t.slice(0, 80));
            perFile[name] = (perFile[name] || 0) + 1;
            if (perFile[name] > 2 || chars + t.length > 11000) continue;
            chars += t.length;
            (c.category === "reference" ? refs : canon).push(`### ${name}\n${t}`);
        }
        return [canon.length ? `CANON:\n${canon.join("\n\n")}` : "", refs.length ? `RECURSOS (referencias e ideas no canon):\n${refs.join("\n\n")}` : ""].filter(Boolean).join("\n\n");
    } catch (e: any) {
        logger.warn(`[ARQUITECTO·CONECTAR] Sin material relevante (embedding): ${e?.message}`);
        return "";
    }
}

async function sessionHistory(uid: string, sessionId: string, limit = 16): Promise<string> {
    const snap = await getFirestore().collection("users").doc(uid).collection("forge_sessions").doc(sessionId)
        .collection("messages").orderBy("timestamp", "desc").limit(limit).get();
    return snap.docs.reverse()
        .filter(d => (d.data() as any).role !== "system")
        .map(d => {
            const m: any = d.data();
            const t = String(m.text || "");
            return `${m.role === "user" ? "AUTOR" : "ARQUITECTO"}: ${m.role === "user" ? t.slice(0, 2500) : t.slice(0, 1400)}`;
        }).join("\n\n");
}

async function ask(contextBlocks: string[], instruction: string, label: string, maxTokens = 3000): Promise<string> {
    const r = await callClaude({
        model: CLAUDE_SONNET,
        system: [{ text: CONECTAR_SYSTEM + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }],
        content: [{ type: "text", text: [...contextBlocks.filter(Boolean), instruction].join("\n\n") }],
        maxTokens,
        effort: "low",
        label,
    } as any);
    if (!r.ok || !r.text) {
        if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
        throw new HttpsError("internal", "El Arquitecto no pudo responder. Intenta de nuevo.");
    }
    return r.text.trim();
}

/** Primer mensaje de una sesión «Conectar». */
export async function conectarStart(uid: string, goal: string, apiKey: string): Promise<string> {
    const [map, memory, material] = await Promise.all([
        worldMap(uid),
        getMemoryContext(uid, goal),
        relevantMaterial(uid, goal, apiKey),
    ]);
    logger.info(`🏛️ [ARQUITECTO·CONECTAR] Inicio: mapa ${map.length} car., material ${material.length} car.`);
    return ask([
        map ? `MAPA DE SU MATERIAL (archivos por carpeta):\n${map}` : "MAPA DE SU MATERIAL: (todavía no hay archivos)",
        memory ? `MEMORIA DEL PROYECTO (decisiones y dónde quedó):\n${memory}` : "",
        material ? `FRAGMENTOS RELEVANTES:\n${material}` : "",
    ], `INICIO DE SESIÓN. El autor dice lo que trae hoy:\n«${goal}»\n\nResponde: en 3 a 5 líneas, qué piezas de su material ves relacionadas con eso (nombrando archivos) y por qué; luego tu primera pregunta (máximo 2). Si su material está vacío, pregúntale por lo esencial en vez de suponer.`, "ArquitectoConectarInicio");
}

/** Respuesta a un mensaje en una sesión «Conectar». */
export async function conectarReply(uid: string, sessionId: string, goal: string, query: string, apiKey: string): Promise<string> {
    const history = await sessionHistory(uid, sessionId);
    const hint = `${query} ${history.slice(-1200)}`;
    const [memory, material] = await Promise.all([
        getMemoryContext(uid, hint),
        relevantMaterial(uid, hint, apiKey),
    ]);
    return ask([
        goal ? `OBJETIVO DE LA SESIÓN: ${goal}` : "",
        memory ? `MEMORIA DEL PROYECTO:\n${memory}` : "",
        material ? `FRAGMENTOS RELEVANTES DE SU MATERIAL:\n${material}` : "",
        history ? `CONVERSACIÓN HASTA AHORA:\n${history}` : "",
    ], `AUTOR: ${query}`, "ArquitectoConectar");
}

/** Cierre: resumen en cuatro partes; se guarda como nota en Recursos/«Sesiones del Arquitecto». */
export async function conectarClose(uid: string, sessionId: string, accessToken?: string): Promise<{ summary: string; savedAs?: string }> {
    const history = await sessionHistory(uid, sessionId, 40);
    if (!history) throw new HttpsError("failed-precondition", "No hay conversación que resumir.");
    const summary = await ask([`CONVERSACIÓN COMPLETA:\n${history}`], CLOSE_TASK, "ArquitectoCierre", 3000);
    let savedAs: string | undefined;
    if (accessToken) {
        try {
            const cfg: any = (await getFirestore().collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
            const rootId: string | undefined = (cfg.resourcePaths || [])[0]?.id;
            if (rootId) {
                const drive = drv(accessToken);
                const q = `'${rootId}' in parents and name = '${SESSIONS_FOLDER}' and mimeType = '${FOLDER}' and trashed = false`;
                let folderId = (await drive.files.list({ q, fields: "files(id)", pageSize: 1 })).data.files?.[0]?.id;
                if (!folderId) {
                    folderId = (await drive.files.create({ requestBody: { name: SESSIONS_FOLDER, mimeType: FOLDER, parents: [rootId] }, fields: "id" })).data.id!;
                }
                const sess: any = (await getFirestore().collection("users").doc(uid).collection("forge_sessions").doc(sessionId).get()).data() || {};
                const goal = String(sess.implementationGoal || "Sesión").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
                const date = new Date().toISOString().slice(0, 10);
                const name = `${date} ${goal}.md`;
                const content = `---\ntipo: sesion-arquitecto\ncanon: no\nfecha: ${date}\n---\n\n# ${goal}\n\n${summary}\n`;
                await drive.files.create({ requestBody: { name, mimeType: "text/markdown", parents: [folderId] }, media: { mimeType: "text/markdown", body: content }, fields: "id" });
                savedAs = `Recursos → ${SESSIONS_FOLDER} → ${name.replace(/\.md$/, "")}`;
            }
        } catch (e: any) {
            logger.warn(`[ARQUITECTO·CONECTAR] Resumen sin guardar en Drive: ${e?.message}`);
        }
    }
    return { summary, savedAs };
}
