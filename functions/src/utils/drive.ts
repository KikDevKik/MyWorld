import * as logger from "firebase-functions/logger";
import { Readable } from 'stream';
import { maskLog } from "./logger";

// 🛡️ SENTINEL UPDATE: Added maxSizeBytes to prevent DoS/OOM
const MAX_STREAM_SIZE_BYTES = 10 * 1024 * 1024; // 10MB Default

export async function streamToString(stream: Readable, debugLabel: string = "UNKNOWN", maxSizeBytes: number = MAX_STREAM_SIZE_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let currentSize = 0;

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      currentSize += chunk.length;

      // 🛡️ SECURITY CHECK: Prevent OOM/DoS
      if (currentSize > maxSizeBytes) {
        logger.error(`🛑 [SECURITY] Stream Limit Exceeded for ${debugLabel}. Size: ${currentSize} > ${maxSizeBytes}. Aborting.`);
        stream.destroy(); // Abort the stream to save bandwidth/memory
        reject(new Error(`Security Limit Exceeded: File ${debugLabel} exceeds max size of ${maxSizeBytes} bytes.`));
        return;
      }

      chunks.push(Buffer.from(chunk));
    });

    stream.on('error', (err) => reject(err));
    stream.on('end', () => {
      const fullBuffer = Buffer.concat(chunks);
      logger.debug(`📉 [STREAM DEBUG] Buffer size for ${debugLabel}: ${fullBuffer.length} bytes`);

      let text = "";
      try {
        text = fullBuffer.toString('utf8');
        // Sanitize NULL bytes for Firestore safety
        // eslint-disable-next-line no-control-regex
        text = text.replace(/\0/g, '');
      } catch (err) {
        logger.error(`💥 [STREAM ERROR] Failed to convert buffer to string for ${debugLabel}:`, err);
        text = ""; // Fallback to empty
      }

      if (text) {
        // 🛡️ SENTINEL: Use maskLog for consistency
        logger.debug(`📉 [STREAM DEBUG] Preview (${debugLabel}): ${maskLog(text.replace(/\n/g, ' '), 100)}`);
      } else {
        logger.warn(`📉 [STREAM DEBUG] Preview (${debugLabel}): [EMPTY OR NULL CONTENT]`);
      }

      resolve(text);
    });
  });
}

export async function _getDriveFileContentInternal(drive: any, fileId: string): Promise<string> {
  try {
    logger.info(`📖 [LECTOR V5] Analizando archivo: ${fileId}`);

    // 1. PASO DE RECONOCIMIENTO
    const meta = await drive.files.get({
      fileId: fileId,
      fields: "mimeType, name",
      supportsAllDrives: true
    }, {
      headers: { 'Cache-Control': 'no-cache' }
    });

    const mimeType = meta.data.mimeType;
    const fileName = meta.data.name || fileId;
    logger.info(`   - Tipo Identificado: ${mimeType}`);

    let res;

    // 🛑 DEFENSA 1: SI ES UNA CARPETA, ABORTAR MISIÓN
    if (mimeType === "application/vnd.google-apps.folder") {
      logger.warn("   -> ¡Es una carpeta! Deteniendo descarga.");
      return "📂 [INFO] Has seleccionado una carpeta. Abre el árbol para ver sus archivos.";
    }

    // 2. SELECCIÓN DE ARMA
    if (mimeType === "application/vnd.google-apps.document") {
      // A) ES UN GOOGLE DOC
      logger.info("   -> Estrategia: EXPORT (Google Doc a Texto)");
      res = await drive.files.export({
        fileId: fileId,
        mimeType: "text/plain",
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' }
      });

    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      // B) ES UNA HOJA DE CÁLCULO
      logger.info("   -> Estrategia: EXPORT (Sheet a CSV)");
      res = await drive.files.export({
        fileId: fileId,
        mimeType: "text/csv",
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' }
      });

    } else {
      // C) ES UN ARCHIVO NORMAL (.md, .txt)
      logger.info("   -> Estrategia: DOWNLOAD (Binario)");
      res = await drive.files.get({
        fileId: fileId,
        alt: "media",
        supportsAllDrives: true
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' }
      });
    }

    // 📉 [HEADER DEBUG]
    if (res.headers && res.headers['content-length']) {
      logger.debug(`📉 [HEADER DEBUG] Content-Length for ${fileName}: ${res.headers['content-length']}`);
    } else {
      logger.debug(`📉 [HEADER DEBUG] No Content-Length header received for ${fileName}`);
    }

    // 3. PROCESAR
    return await streamToString(res.data, fileName);

  } catch (error: any) {
    logger.error(`💥 [ERROR LECTURA] Falló al procesar ${fileId}:`, error);
    // 🟢 BLINDAJE DEL LECTOR: NO CRASHEAR. DEVOLVER AVISO.
    return `[ERROR: No se pudo cargar el archivo. Verifica permisos o existencia. Detalle: ${error.message}]`;
  }
}

/**
 * 🟢 HELPER: Trace Lineage for Deterministic ID (Nexus Protocol)
 */
export async function resolveVirtualPath(drive: any, folderId: string): Promise<string> {
    const pathSegments: string[] = [];
    let currentId = folderId;

    // Safety depth limit to prevent infinite loops
    for (let i = 0; i < 15; i++) {
        try {
            const res = await drive.files.get({
                fileId: currentId,
                fields: 'id, name, parents'
            });
            const { name, parents } = res.data;
            pathSegments.unshift(name);

            if (!parents || parents.length === 0) break; // Reached root or shared drive root
            currentId = parents[0];
        } catch (e) {
            logger.warn(`Failed to trace parent for ${currentId}`, e);
            break;
        }
    }
    return pathSegments.join('/');
}
