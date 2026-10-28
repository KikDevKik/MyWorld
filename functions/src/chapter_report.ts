// Oct 2026: Reporte de capítulo.
// El autor termina un capítulo y pide un reporte: qué funciona, qué corregir (con la cita exacta para
// ubicarlo en el editor), ortografía con corrección aplicable, y lecturas recomendadas apoyadas en sus
// propias referencias (carpetas de Recursos). Se guarda el último reporte por archivo.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { _getDriveFileContentInternal } from "./utils/drive";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_SONNET, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext } from "./utils/memory_store";
import { textHash } from "./utils/text_hash";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const REPORT_SYSTEM = `Eres el editor de MyWorld. El autor terminó un capítulo y te pide un reporte para reescribirlo.
Lees el capítulo completo y devuelves un diagnóstico útil, honesto y accionable. No reescribes su prosa: señalas, explicas y sugieres.

QUÉ REVISAS:
- Lo que funciona (con la cita que lo demuestra), para que lo conserve.
- Problemas de oficio: punto de vista y persona narrativa, promesas sin cumplir (armas de Chéjov), continuidad con su plan y su canon, ritmo (escenas infladas o apresuradas), diálogos, claridad, tono.
- Ortografía y puntuación (incluida la de diálogos: raya, incisos, mayúsculas de nombres propios).
- Referencias para estudiar, ligadas a los problemas de ESTE capítulo:
  1. PRIMERO sus propias referencias (series, anime, películas, libros o autores que menciona en sus archivos de Recursos): para cada una, qué escena o recurso concreto mirar y qué problema del capítulo le ayuda a resolver. Márcalas con "deSusReferencias": true y "tipo" según lo que sean.
  2. Después, como mucho 3 libros reales y conocidos de los que estés completamente seguro: título y autor EXACTOS tal como se publicaron en español (p. ej. «Mientras escribo», Stephen King). Nunca inventes ni aproximes un título ("o similar" no vale); si no estás seguro, OMITE esa entrada por completo (nunca escribas una entrada que diga que no estás seguro o que se ignore).

REGLAS DE LAS CITAS (muy importante, el editor las usa para ubicar cada punto):
- "cita" debe ser texto COPIADO EXACTAMENTE del capítulo (mismas letras, tildes, errores y puntuación), de 4 a 15 palabras, sin "…" ni cambios.
- En ortografía, "original" es la palabra o tramo exacto con el error (tal cual aparece) y "cita" un tramo exacto que lo contiene; "correccion" reemplaza solo a "original".
- Si no puedes citar exacto, deja "cita" vacía.

FORMATO: responde SOLO JSON con esta forma:
{
 "resumen": "2-3 frases: estado del capítulo y lo más importante a mejorar",
 "fortalezas": [{"titulo":"…","explicacion":"…","cita":"…"}],
 "problemas": [{"tipo":"pov|continuidad|ritmo|dialogo|claridad|tono|estructura","gravedad":"alta|media|baja","titulo":"…","explicacion":"por qué no funciona","sugerencia":"qué hacer (sin escribirle la prosa)","citas":["…"]}],
 "ortografia": [{"original":"…","correccion":"…","cita":"…","nota":"regla breve, opcional"}],
 "lecturas": [{"titulo":"…","autor":"autor o estudio","tipo":"libro|serie|anime|película|otro","deSusReferencias":true,"porque":"qué escena o técnica mirar y para qué problema de este capítulo"}],
 "siguientePaso": "la primera cosa que haría en la reescritura"
}
Máximo: 4 fortalezas, 8 problemas (ordenados por gravedad), 30 ortografía, 6 referencias. Escribe en el idioma del autor.`;

// Oct 2026: las referencias se leen directo de las carpetas de Recursos en Drive (el índice no siempre
// las tiene: archivos cortos o sin re-indexar). Si no hay token de Drive, se intenta con el índice.
async function loadReferencesFromDrive(uid: string, accessToken: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });
    const cfg: any = (await getFirestore().collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
    const roots: string[] = (cfg.resourcePaths || []).map((p: any) => p.id).filter(Boolean);
    const files: { id: string; name: string }[] = [];
    const walk = async (folderId: string, depth: number) => {
        if (depth > 3 || files.length >= 12) return;
        const res = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: "files(id,name,mimeType)", pageSize: 100 });
        for (const f of res.data.files || []) {
            if (files.length >= 12) break;
            if (f.mimeType === "application/vnd.google-apps.folder") await walk(f.id!, depth + 1);
            else if (/\.(md|txt)$/i.test(f.name || "") || f.mimeType === "application/vnd.google-apps.document") files.push({ id: f.id!, name: f.name! });
        }
    };
    for (const r of roots) await walk(r, 0);
    const parts: string[] = [];
    for (const f of files) {
        try {
            const text = String(await _getDriveFileContentInternal(drive, f.id) || "").trim().slice(0, 900);
            if (text) parts.push(`### ${f.name.replace(/\.md$/i, "")}\n${text}`);
        } catch { /* archivo ilegible: se omite */ }
    }
    logger.info(`[REPORT] Referencias (Drive): ${parts.length} archivos (${files.map(f => f.name).join(", ")})`);
    return parts.join("\n\n").slice(0, 9000);
}

async function loadReferences(uid: string, accessToken?: string): Promise<string> {
    if (accessToken) {
        try {
            const fromDrive = await loadReferencesFromDrive(uid, accessToken);
            if (fromDrive) return fromDrive;
        } catch (e: any) {
            logger.warn(`[REPORT] No se pudieron leer las referencias de Drive: ${e?.message}`);
        }
    }
    try {
        const db = getFirestore();
        const files = await db.collection("TDB_Index").doc(uid).collection("files")
            .where("category", "==", "reference").limit(40).get();
        const docs = files.docs.filter(d => (d.data() as any).type !== "folder").slice(0, 12);
        const parts: string[] = [];
        for (const d of docs) {
            const name = (d.data() as any).name || d.id;
            const ch = await d.ref.collection("chunks").limit(2).get();
            const text = ch.docs.map(c => String((c.data() as any).text || "")).join("\n").slice(0, 700);
            if (text.trim()) parts.push(`### ${name}\n${text}`);
        }
        logger.info(`[REPORT] Referencias del autor: ${parts.length} archivos (${parts.map(p => p.split("\n")[0].replace("### ", "")).join(", ")})`);
        return parts.join("\n\n").slice(0, 8000);
    } catch (e: any) {
        logger.warn(`[REPORT] No se pudieron leer las referencias: ${e?.message}`);
        return "";
    }
}

export const chapterReport = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 300, memory: "512MiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, fileId, fileName, content, accessToken } = request.data || {};
        if (!fileId) throw new HttpsError("invalid-argument", "Falta fileId.");
        const ref = getFirestore().collection("users").doc(uid).collection("chapter_reports").doc(fileId);

        if (mode === "get") {
            const snap = await ref.get();
            return snap.exists ? { found: true, ...(snap.data() as any) } : { found: false };
        }

        const text = String(content || "");
        if (text.trim().length < 300) throw new HttpsError("invalid-argument", "El capítulo es demasiado corto para un reporte.");
        if (text.length > 120000) throw new HttpsError("invalid-argument", "El capítulo es demasiado largo (máx. ~20.000 palabras).");
        if (!claudeEnabledForCurrentUser()) {
            throw new HttpsError("failed-precondition", "El reporte de capítulo usa Claude y todavía no está activo para tu cuenta.");
        }

        const [memory, references] = await Promise.all([
            getMemoryContext(uid, `${fileName || ""} reporte capítulo`),
            loadReferences(uid, accessToken),
        ]);

        const userText = [
            memory ? `MEMORIA DEL PROYECTO (plan y decisiones del autor):\n${memory}` : "",
            references ? `REFERENCIAS DEL AUTOR (de sus carpetas de Recursos):\n${references}` : "REFERENCIAS DEL AUTOR: (no hay archivos de Recursos indexados)",
            `ARCHIVO: ${fileName || "(sin nombre)"}`,
            `CAPÍTULO:\n<<<\n${text}\n>>>`,
            "Responde SOLO con el JSON.",
        ].filter(Boolean).join("\n\n");

        const r = await callClaude({
            model: CLAUDE_SONNET,
            system: [{ text: REPORT_SYSTEM + "\n\n" + MYWORLD_VOICE, cache: true }],
            content: [{ type: "text", text: userText }],
            maxTokens: 12000,
            effort: "medium",
            label: "ChapterReport",
        } as any);
        if (!r.ok || !r.text) {
            if (r.noCredit) throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
            throw new HttpsError("internal", r.refusal ? "Claude no quiso revisar este texto." : "No se pudo generar el reporte. Intenta de nuevo.");
        }
        let report: any;
        try {
            const j = r.text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
            report = JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1));
        } catch {
            logger.warn(`[REPORT] JSON inválido: ${r.text.slice(0, 300)}`);
            throw new HttpsError("internal", "El reporte llegó mal formado. Intenta de nuevo.");
        }
        const saved = { report, fileName: fileName || "", contentHash: textHash(text), createdAt: new Date().toISOString() };
        await ref.set(saved);
        return { found: true, ...saved };
    }
);
