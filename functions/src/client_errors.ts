// Nov 2026: aviso de errores en producción. Cuando la app se rompe en el navegador de alguien, queda anotado
// aquí (colección client_errors) y en los registros del servidor, para enterarnos antes de que el autor escriba a soporte.
// Se guarda el mensaje del error, dónde pasó y la versión; NUNCA el texto que el autor estaba escribiendo.
import { onCall } from "./utils/on_call";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";

const clip = (v: any, n: number) => String(v ?? "").slice(0, n);
const lastByUid = new Map<string, number[]>();

export const logClientError = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, memory: "256MiB" },
    async (request) => {
        const uid = request.auth?.uid || "anon";
        // Como mucho 10 por usuario cada 10 minutos por instancia: un bucle de errores no llena la base.
        const now = Date.now();
        const recent = (lastByUid.get(uid) || []).filter(t => now - t < 600_000);
        if (recent.length >= 10) return { ok: false };
        lastByUid.set(uid, [...recent, now]);
        const d = request.data || {};
        const entry = {
            uid,
            message: clip(d.message, 500),
            stack: clip(d.stack, 3000),
            kind: clip(d.kind, 40),          // error | promesa | pantalla
            where: clip(d.where, 200),       // ruta y cuarto abierto, sin parámetros
            build: clip(d.build, 60),
            ua: clip(d.ua, 300),
            at: new Date().toISOString(),
        };
        if (!entry.message) return { ok: false };
        logger.error(`🧯 [CLIENTE] ${entry.kind} en ${entry.where}: ${entry.message}`, { uid, build: entry.build });
        try { await getFirestore().collection("client_errors").add(entry); } catch { /* el registro del servidor ya lo tiene */ }
        return { ok: true };
    }
);
