// Oct 2026: «Mapa» (antes: Nexus / World Engine), dentro de Preparar.
// Tu mundo como un mapa de conexiones: personajes, lugares, facciones, conceptos y eventos de tu canon,
// unidos por las relaciones que tu propio texto establece (cada una con su archivo de origen).
// Los elementos que se mencionan pero no tienen archivo propio son «fantasmas». El Arquitecto puede
// sugerir conexiones posibles entre piezas lejanas, siempre como hipótesis que tú decides.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_SONNET, CLAUDE_HAIKU, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext, slugify } from "./utils/memory_store";
import { canonFiles, fileText, runPersonajesScan, Personaje } from "./personajes";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

export interface MapNode { id: string; nombre: string; tipo: string; resumen: string; fileId: string | null; archivos: string[]; rol?: string }
export interface MapLink { source: string; target: string; tipo: string; descripcion: string; fuente: string }

const MAP_TASK = `Eres el cartógrafo del mundo de un autor en MyWorld. Recibes la lista de sus personajes (ya identificados), el catálogo de sus archivos del canon y su texto.
1. Extrae las OTRAS entidades importantes de su mundo: lugares, facciones u organizaciones, objetos, conceptos o leyes del mundo (sistemas de poder, razas, eras, reglas), y eventos clave.
   - "archivo": el nombre EXACTO del archivo dedicado a esa entidad si existe (tal cual en el catálogo), o null.
2. Extrae las RELACIONES entre todas las entidades (personajes incluidos), solo las que el texto establece:
   - "de" y "a": nombres exactos tal como aparecen en las listas.
   - "tipo": 1 a 3 palabras (familia de, aliado de, rival de, pertenece a, vive en, gobierna, creó, causó, se opone a, maestro de, ama a, teme a, origen de, usa…).
   - "descripcion": una frase corta (máximo 12 palabras). "fuente": el archivo donde se establece.
Nada inventado: si el texto no lo dice, no va.
FORMATO: SOLO JSON {"entidades":[{"nombre":"…","tipo":"lugar|faccion|objeto|concepto|evento","resumen":"1 frase","archivo":"…|null","archivos":["…"]}],"relaciones":[{"de":"…","a":"…","tipo":"…","descripcion":"…","fuente":"…"}]}
Máximo 45 entidades y 110 relaciones (las más importantes primero). Resúmenes de máximo 15 palabras. Pon "relaciones" DESPUÉS de "entidades".`;

const SUGGEST_TASK = `Eres El Arquitecto de MyWorld mirando el mapa del mundo del autor. Propón conexiones POSIBLES entre piezas que hoy están lejos o sueltas en su mapa, de las que harían su mundo más cohesionado o su historia más interesante.
- Cada propuesta es una hipótesis, no una decisión: di qué conectarías, qué consecuencia tendría y qué pregunta debe responderse el autor para decidir.
- Apóyate en lo que su material dice (nombra el archivo cuando sirva). Nada que contradiga su canon.
- Prioriza piezas aisladas (pocas conexiones) y elementos importantes que no se tocan.
FORMATO: SOLO JSON {"sugerencias":[{"de":"nombre exacto","a":"nombre exacto","idea":"1-2 frases","consecuencia":"1 frase","pregunta":"1 frase"}]} — exactamente 5.`;

function parseJson(text: string): any {
    const j = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const start = j.indexOf("{");
    try { return JSON.parse(j.slice(start, j.lastIndexOf("}") + 1)); } catch { /* respuesta cortada: se rescata */ }
    // Oct 2026: si la respuesta se cortó por largo, se conserva todo lo completo hasta el último objeto cerrado.
    let tries = 0;
    for (let i = j.length - 1; i > start && tries < 400; i--) {
        if (j[i] !== "}") continue;
        tries++;
        for (const suffix of ["", "]}", "]}]}", "}]}", "]}}"]) {
            try { return JSON.parse(j.slice(start, i + 1) + suffix); } catch { /* sigue */ }
        }
    }
    throw new Error("JSON irrecuperable");
}

async function ask(model: string, system: string, user: string, label: string, maxTokens: number, effort: "low" | "medium" = "low") {
    const r = await callClaude({ model, system: [{ text: system + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }], content: [{ type: "text", text: user }], maxTokens, effort, label } as any);
    if (!r.ok || !r.text) {
        if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
        throw new HttpsError("internal", "No pude completar esto. Intenta de nuevo.");
    }
    try { return parseJson(r.text); } catch { throw new HttpsError("internal", "La respuesta llegó mal formada. Intenta de nuevo."); }
}

export const mapaMundo = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 540, memory: "1GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode } = request.data || {};
        const ref = getFirestore().collection("users").doc(uid).collection("mapa").doc("grafo");

        if (mode === "get") {
            const d: any = (await ref.get()).data() || {};
            return { nodes: d.nodes || [], links: d.links || [], sugerencias: d.sugerencias || [], scannedAt: d.scannedAt || null };
        }
        if (!claudeEnabledForCurrentUser()) throw new HttpsError("failed-precondition", "El Mapa usa Claude y todavía no está activo para tu cuenta.");

        if (mode === "scan") {
            // Personajes primero (si nunca se escanearon o si se pide refrescar todo)
            let personajes: Personaje[] = ((await getFirestore().collection("users").doc(uid).collection("personajes").doc("index").get()).data() as any)?.personajes || [];
            if (!personajes.length || request.data?.refreshPersonajes) personajes = (await runPersonajesScan(uid)).personajes;

            const files = await canonFiles(uid);
            const texts = await Promise.all(files.map(f => fileText(uid, f.id, 6000).catch(() => "")));
            let budget = 240000;
            const catalog: string[] = [], bodies: string[] = [];
            files.forEach((f: any, i: number) => {
                const name = String(f.name || "").replace(/\.md$/i, "");
                catalog.push(`- «${name}» (${f.path || name})`);
                const t = texts[i] || "";
                if (t && budget > 0) { const piece = t.slice(0, Math.min(6000, budget)); budget -= piece.length; bodies.push(`### ${name}\n${piece}`); }
            });
            const parsed = await ask(CLAUDE_HAIKU, MAP_TASK, [
                `PERSONAJES YA IDENTIFICADOS:\n${personajes.map(p => `- ${p.nombre}${p.alias.length ? ` (${p.alias.join(", ")})` : ""}`).join("\n")}`,
                `CATÁLOGO DE ARCHIVOS DEL CANON:\n${catalog.join("\n").slice(0, 30000)}`,
                `TEXTO:\n${bodies.join("\n\n")}`,
                "Responde SOLO con el JSON.",
            ].join("\n\n"), "MapaScan", 16000);

            const byFile = new Map(files.map((f: any) => [String(f.name || "").replace(/\.md$/i, "").toLowerCase(), f.id]));
            const nodes: MapNode[] = personajes.map(p => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, resumen: p.resumen, fileId: p.fichaFileId, archivos: p.archivos, rol: p.rol }));
            const nameToId = new Map<string, string>();
            personajes.forEach(p => { nameToId.set(p.nombre.toLowerCase(), p.id); p.alias.forEach(a => nameToId.set(a.toLowerCase(), p.id)); });
            for (const e of (parsed.entidades || [])) {
                if (!e?.nombre) continue;
                const id = slugify(e.nombre);
                if (nameToId.has(String(e.nombre).toLowerCase()) || nodes.some(n => n.id === id)) continue;
                const fid = e.archivo ? byFile.get(String(e.archivo).replace(/\.md$/i, "").toLowerCase()) || null : null;
                nodes.push({ id, nombre: String(e.nombre), tipo: ["lugar", "faccion", "objeto", "concepto", "evento"].includes(e.tipo) ? e.tipo : "concepto", resumen: String(e.resumen || ""), fileId: fid, archivos: (e.archivos || []).map(String).slice(0, 8) });
                nameToId.set(String(e.nombre).toLowerCase(), id);
            }
            const resolve = (n: string) => nameToId.get(String(n || "").toLowerCase()) || nodes.find(x => x.id === slugify(n))?.id;
            const seen = new Set<string>();
            const links: MapLink[] = [];
            for (const r of (parsed.relaciones || [])) {
                const s = resolve(r?.de), t = resolve(r?.a);
                if (!s || !t || s === t) continue;
                const k = `${s}|${t}|${String(r.tipo || "").toLowerCase()}`;
                if (seen.has(k)) continue;
                seen.add(k);
                links.push({ source: s, target: t, tipo: String(r.tipo || "relación").slice(0, 40), descripcion: String(r.descripcion || ""), fuente: String(r.fuente || "") });
            }
            const now = new Date().toISOString();
            await ref.set({ nodes, links, sugerencias: [], scannedAt: now });
            logger.info(`🗺️ [MAPA] ${nodes.length} nodos, ${links.length} relaciones`);
            return { nodes, links, sugerencias: [], scannedAt: now };
        }

        if (mode === "suggest") {
            const d: any = (await ref.get()).data() || {};
            const nodes: MapNode[] = d.nodes || [], links: MapLink[] = d.links || [];
            if (!nodes.length) throw new HttpsError("failed-precondition", "Primero escanea tu mundo.");
            const deg: Record<string, number> = {};
            links.forEach(l => { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; });
            const name = (id: string) => nodes.find(n => n.id === id)?.nombre || id;
            const memory = await getMemoryContext(uid, nodes.slice(0, 30).map(n => n.nombre).join(" "));
            const parsed = await ask(CLAUDE_SONNET, SUGGEST_TASK, [
                `ELEMENTOS (nombre · tipo · conexiones · resumen):\n${nodes.map(n => `- ${n.nombre} · ${n.tipo} · ${deg[n.id] || 0} · ${n.resumen}`).join("\n").slice(0, 20000)}`,
                `RELACIONES ACTUALES:\n${links.map(l => `- ${name(l.source)} —${l.tipo}→ ${name(l.target)}`).join("\n").slice(0, 15000)}`,
                memory ? `MEMORIA DEL PROYECTO:\n${memory}` : "",
                "Responde SOLO con el JSON.",
            ].filter(Boolean).join("\n\n"), "MapaSugerencias", 5000, "medium");
            const byName = new Map(nodes.map(n => [n.nombre.toLowerCase(), n.id]));
            const sugerencias = (parsed.sugerencias || []).map((s: any) => ({ ...s, source: byName.get(String(s.de || "").toLowerCase()) || null, target: byName.get(String(s.a || "").toLowerCase()) || null }))
                .filter((s: any) => s.source && s.target && s.source !== s.target);
            await ref.set({ sugerencias }, { merge: true });
            return { sugerencias };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
