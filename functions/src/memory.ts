// Oct 2026: funciones de la Memoria de MyWorld.
// - updateMemory: tras cada respuesta del Director/Arquitecto, Haiku decide qué recordar (solo lo que el autor dijo o confirmó).
// - undoMemory: botón "Deshacer" del aviso.
// - getMemory / editMemory: panel "Memoria" (ver, corregir, borrar).
// - Copia de cada archivo de memoria en la carpeta "_Memoria MyWorld" del proyecto en Drive (la ve Obsidian).
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { google } from "./utils/gapi";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_HAIKU } from "./utils/claude_router";
import {
    loadAllMemory, applyMemoryOps, undoMemoryOps, memoryCol, memoryFileToMarkdown,
    MemoryOp, AppliedOp, MemoryFile, invalidateMemoryCache, newLineId,
} from "./utils/memory_store";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const OPTS = { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 120 };

const EXTRACTION_RULES = `Eres el filtro de la MEMORIA de MyWorld, un entorno de escritura para novelistas.
Lees UN intercambio entre el AUTOR y una herramienta de IA y decides si contiene algo que valga la pena recordar en sesiones futuras. Casi nunca lo hay: en 9 de cada 10 intercambios la respuesta correcta es {"ops":[]}.

PRUEBA (todas deben cumplirse para guardar):
1. Lo dijo o confirmó el AUTOR (no basta con que la IA lo propusiera o lo describiera).
2. Seguirá siendo cierto y útil dentro de dos semanas.
3. No se puede recuperar leyendo su manuscrito o su canon (lo que ya escribió está en sus archivos).
4. Cambiaría cómo le ayuda una herramienta en una conversación futura.

SÍ SE GUARDA:
- Decisiones de la obra tomadas en la conversación y aún no escritas: estructura, giros, finales, reglas del mundo, motivaciones. ("El libro de Anna va en 3 actos; en el acto 3 Anna se une a TDB.")
- Preferencias GENERALES sobre cómo quiere que lo ayuden, válidas para cualquier escena futura. Señales: "siempre", "nunca", "no me…", "prefiero que…". ("Quiere críticas directas, sin elogios de relleno.")
- Pendientes que el AUTOR declaró como pendientes ("eso lo decido después", "me falta definir X").
- "Dónde quedó": SOLO cuando cambia de capítulo o termina uno (hito), en ≤15 palabras y en términos de la historia. ("Capítulo 1 terminado en borrador; sigue el capítulo 2.")

NO SE GUARDA (ejemplos reales que estuvieron mal):
- Lo que el autor le pidió a la herramienta o lo que hizo con ella: "pidió un reporte", "aún no ha pegado el texto", "recibió el reporte y no lo ha revisado".
- Instrucciones para la escena o el mensaje actual, aunque suenen a preferencia: "quiere no alargar las escenas y cerrar rápido la plaza" (era para esa escena).
- Resúmenes de lo que pasa en la escena que está escribiendo (ya está en su archivo).
- Ideas de las que el autor duda o que la IA sugirió y él no aceptó.
- Explicaciones o datos que el autor le dio a la IA para que entendiera su texto ("STOP es un juego de…"), salvo que sea una regla nueva del mundo que no está en el canon.
- Avances dentro del mismo capítulo: NO actualices "Dónde quedó" por cada escena; solo por hitos.
- Cualquier cosa que ya esté en la MEMORIA ACTUAL, aunque cambie la redacción.

ARCHIVOS: "Preferencias del autor" (preferencias), "Libro de <nombre>" (libro), "Personaje: <nombre>" (personaje), "Pendientes" (pendientes).
Si el autor pide olvidar algo o una línea quedó desactualizada, usa remove/update sobre esa línea.

FORMATO: responde SOLO JSON:
{"ops":[{"op":"add|update|remove","file":"<nombre>","kind":"<kind>","text":"<≤20 palabras, en tercera persona>","lineId":"<id si update/remove>","porque":"<qué parte de la PRUEBA cumple y por qué seguirá importando en dos semanas>"}]}
Máximo 2 ops. Si dudas, no guardes: {"ops":[]}.`;

function memoryIndex(files: MemoryFile[]): string {
    if (!files.length) return "(memoria vacía)";
    return files.map(f => `### ${f.name} (kind: ${f.kind})\n` + (f.lines.length ? f.lines.map(l => `- [${l.id}] ${l.text}`).join("\n") : "(sin líneas)")).join("\n\n").slice(0, 9000);
}

async function mirrorToDrive(uid: string, accessToken: string | undefined, slugs: string[]) {
    if (!accessToken || !slugs.length) return;
    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });
        const cfgRef = getFirestore().collection("users").doc(uid).collection("profile").doc("project_config");
        const cfg: any = (await cfgRef.get()).data() || {};
        if (!cfg.folderId) return;
        let folderId: string = cfg.memoryFolderId;
        if (!folderId) {
            const f = await drive.files.create({ requestBody: { name: "_Memoria MyWorld", mimeType: "application/vnd.google-apps.folder", parents: [cfg.folderId] }, fields: "id" });
            folderId = f.data.id!;
            await cfgRef.set({ memoryFolderId: folderId }, { merge: true });
        }
        for (const slug of [...new Set(slugs)]) {
            const ref = memoryCol(uid).doc(slug);
            const snap = await ref.get();
            if (!snap.exists) continue;
            const mf = { slug, ...(snap.data() as any) } as MemoryFile;
            const body = memoryFileToMarkdown(mf);
            if (mf.driveFileId) {
                try {
                    await drive.files.update({ fileId: mf.driveFileId, media: { mimeType: "text/markdown", body } });
                    continue;
                } catch { /* el archivo pudo borrarse en Drive: se recrea */ }
            }
            const created = await drive.files.create({
                requestBody: { name: `${mf.name}.md`, parents: [folderId], mimeType: "text/markdown" },
                media: { mimeType: "text/markdown", body }, fields: "id",
            });
            await ref.set({ driveFileId: created.data.id }, { merge: true });
        }
    } catch (e: any) {
        logger.warn(`[MEMORY] Copia en Drive falló: ${e?.message}`);
    }
}

export const updateMemory = onCall(OPTS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    const uid = request.auth.uid;
    const { userMessage, assistantMessage, tool, accessToken, activeFileName } = request.data || {};
    if (!userMessage || !claudeEnabledForCurrentUser()) return { saved: [] };

    const files = await loadAllMemory(uid);
    const prompt = `MEMORIA ACTUAL:\n${memoryIndex(files)}\n\nHERRAMIENTA: ${tool || "director"}\nARCHIVO ABIERTO: ${activeFileName || "(ninguno)"}\n\nMENSAJE DEL AUTOR:\n${String(userMessage).slice(0, 4000)}\n\nRESPUESTA DE LA IA:\n${String(assistantMessage || "").slice(0, 3000)}\n\nResponde SOLO con el JSON.`;
    const r = await callClaude({
        model: CLAUDE_HAIKU,
        system: [{ text: EXTRACTION_RULES, cache: true }],
        content: [{ type: "text", text: prompt }],
        maxTokens: 2500,
        label: "MemoryUpdate",
    });
    if (!r.ok || !r.text) return { saved: [] };
    let ops: MemoryOp[] = [];
    try {
        const jsonText = r.text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        const start = jsonText.indexOf("{"), end = jsonText.lastIndexOf("}");
        ops = (JSON.parse(jsonText.slice(start, end + 1)).ops || []) as MemoryOp[];
    } catch (e) {
        logger.warn(`[MEMORY] JSON inválido: ${r.text.slice(0, 200)}`);
        return { saved: [] };
    }
    // Oct 2026: sin justificación no se guarda (obliga al modelo a pasar la prueba de durabilidad).
    ops = ops.filter((o: any) => o?.op === "remove" || (typeof o?.porque === "string" && o.porque.trim().length >= 10)).slice(0, 2);
    if (request.data?.dryRun) return { saved: [], wouldSave: ops };
    if (!ops.length) return { saved: [] };
    const applied = await applyMemoryOps(uid, ops, tool || "director");
    logger.info(`🧠 [MEMORY] ${applied.length} cambios: ${applied.map(a => `${a.op} ${a.fileName}: ${a.text}`).join(" | ")}`);
    await mirrorToDrive(uid, accessToken, applied.map(a => a.slug));
    return { saved: applied };
});

export const undoMemory = onCall(OPTS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    const items = (request.data?.items || []) as AppliedOp[];
    const n = await undoMemoryOps(request.auth.uid, items);
    await mirrorToDrive(request.auth.uid, request.data?.accessToken, items.map(i => i.slug));
    return { undone: n };
});

export const getMemory = onCall(OPTS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    const files = await loadAllMemory(request.auth.uid);
    const order: Record<string, number> = { preferencias: 0, libro: 1, pendientes: 2, personaje: 3, otro: 4 };
    files.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.name.localeCompare(b.name));
    return { files };
});

/** Panel: { slug, action: 'edit'|'delete'|'add'|'deleteFile', lineId?, text?, name?, kind? } */
export const editMemory = onCall(OPTS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    const uid = request.auth.uid;
    const { slug, action, lineId, text, name, kind, accessToken } = request.data || {};
    if (!slug && action !== 'add') throw new HttpsError("invalid-argument", "Falta slug.");
    if (action === 'deleteFile') {
        await memoryCol(uid).doc(slug).delete();
        invalidateMemoryCache(uid);
        return { ok: true };
    }
    if (action === 'add') {
        const applied = await applyMemoryOps(uid, [{ op: 'add', file: name || slug, kind: kind || 'otro', text }], 'panel');
        await mirrorToDrive(uid, accessToken, applied.map(a => a.slug));
        return { ok: true, applied };
    }
    const ref = memoryCol(uid).doc(slug);
    await getFirestore().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const lines = ((snap.data() as any).lines || []) as any[];
        if (action === 'edit') { const l = lines.find(x => x.id === lineId); if (l && text?.trim()) { l.text = text.trim(); l.at = new Date().toISOString(); l.source = 'panel'; } }
        if (action === 'delete') { const i = lines.findIndex(x => x.id === lineId); if (i >= 0) lines.splice(i, 1); }
        tx.set(ref, { lines, updatedAt: new Date().toISOString() }, { merge: true });
    });
    invalidateMemoryCache(uid);
    await mirrorToDrive(uid, accessToken, [slug]);
    return { ok: true };
});

// evitar "unused" en algunos compiladores
void newLineId;
