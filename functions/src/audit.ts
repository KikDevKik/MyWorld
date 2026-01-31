import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import * as crypto from 'crypto';

interface CreativeLogEntry {
    id?: string;
    timestamp?: any;
    projectId: string;
    userId: string;
    component: string;
    actionType: string;
    description: string;
    payload: Record<string, any>;
    sessionHash?: string;
}

const PdfPrinter = require("pdfmake");

export const generateAuditPDF = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        timeoutSeconds: 300,
        memory: "1GiB",
    },
    async (request) => {
        const db = getFirestore();

        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required.");

        const { projectId } = request.data;
        const userId = request.auth.uid;

        if (!projectId) throw new HttpsError("invalid-argument", "Missing Project ID.");

        try {
            // 1. FETCH LOGS
            const logRef = db.collection('users').doc(userId).collection('projects').doc(projectId).collection('audit_log');
            // Explicitly order by timestamp
            const snapshot = await logRef.orderBy('timestamp', 'asc').get();

            if (snapshot.empty) {
                throw new HttpsError("not-found", "No audit records found for this project.");
            }

            const logs: CreativeLogEntry[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreativeLogEntry));

            // 2. CALCULATE METRICS
            const totalEvents = logs.length;
            const injections = logs.filter(l => l.actionType === 'INJECTION').length;
            const curations = logs.filter(l => l.actionType === 'CURATION').length;
            const structures = logs.filter(l => l.actionType === 'STRUCTURE').length;
            const research = logs.filter(l => l.actionType === 'RESEARCH').length;

            const generationDate = new Date().toISOString().split('T')[0];

            // 3. DEFINE PDF CONTENT
            const fonts = {
                Roboto: {
                    normal: "Helvetica",
                    bold: "Helvetica-Bold",
                    italics: "Helvetica-Oblique",
                    bolditalics: "Helvetica-BoldOblique"
                }
            };

            const printer = new PdfPrinter(fonts);

            // PROCESS LOGS FOR LAYOUT
            const processedLogs = logs
                .filter(log => {
                    // 🟢 FILTER: Hide old spammy auto-saves (legacy)
                    // We only keep it if it has content snapshot OR is not the old auto-save description
                    if (log.description === 'User manually edited content (Auto-Save)') {
                        // Check if it has content (new version) - actually new version uses different description.
                        // So we can safely hide this legacy noise.
                        return false;
                    }
                    return true;
                })
                .map(log => {
                    let dateStr = 'PENDING';
                    if (log.timestamp && typeof log.timestamp.toDate === 'function') {
                        dateStr = log.timestamp.toDate().toISOString().replace('T', ' ').substring(0, 19);
                    } else if (log.timestamp) {
                        dateStr = String(log.timestamp);
                    }

                    // 🟢 MAPPING: Human Input Label
                    const isHumanInput = log.actionType === 'INJECTION';
                    const displayType = isHumanInput ? 'HUMAN INPUT' : log.actionType;

                    // 🟢 CONTENT EXTRACTION
                    let content = '';
                    if (log.payload?.promptContent) content = log.payload.promptContent;
                    else if (log.payload?.contentSnapshot) content = log.payload.contentSnapshot;

                    return { ...log, dateStr, displayType, content, isHumanInput };
                });

            // BUILD LOG BLOCKS
            const logBlocks: any[] = [];
            processedLogs.forEach(log => {
                // Header Line
                logBlocks.push({
                    text: [
                        { text: `[${log.dateStr}]  `, style: 'logMeta' },
                        { text: `${log.component.toUpperCase()}  `, style: 'logMeta' },
                        { text: log.displayType, style: log.isHumanInput ? 'logTypeHuman' : 'logTypeSystem' }
                    ],
                    margin: [0, 5, 0, 2]
                });

                // Description
                logBlocks.push({
                    text: log.description,
                    style: 'logDescription',
                    margin: [0, 0, 0, 2]
                });

                // Content (if Human Input)
                if (log.content) {
                    logBlocks.push({
                        text: log.content,
                        style: 'logContent',
                        margin: [10, 2, 0, 5] // Indented
                    });
                }

                // Divider
                logBlocks.push({
                    canvas: [ { type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 0.5, lineColor: '#E0E0E0' } ],
                    margin: [0, 0, 0, 5]
                });
            });


            const docDefinition: any = {
                content: [
                    // HEADER
                    { text: 'CERTIFICATE OF AUTHORSHIP', style: 'header', alignment: 'center' },
                    { text: 'OFFICIAL AUDIT RECORD', style: 'subheader', alignment: 'center', margin: [0, 5, 0, 20] },

                    // METADATA
                    {
                        columns: [
                            { width: 'auto', text: 'Project ID:', bold: true },
                            { width: '*', text: projectId, margin: [10, 0, 0, 0] }
                        ],
                        margin: [0, 0, 0, 5]
                    },
                    {
                        columns: [
                            { width: 'auto', text: 'Author ID:', bold: true },
                            { width: '*', text: userId, margin: [10, 0, 0, 0] }
                        ],
                        margin: [0, 0, 0, 5]
                    },
                    {
                        columns: [
                            { width: 'auto', text: 'Date Generated:', bold: true },
                            { width: '*', text: generationDate, margin: [10, 0, 0, 0] }
                        ],
                        margin: [0, 0, 0, 20]
                    },

                    // METRICS TABLE
                    { text: 'CREATIVE ACTIVITY METRICS', style: 'sectionHeader', margin: [0, 0, 0, 5] },
                    {
                        table: {
                            widths: ['*', '*', '*', '*', '*'],
                            body: [
                                [
                                    { text: 'Total Acts', style: 'tableHeader' },
                                    { text: 'Injections (Human)', style: 'tableHeader' },
                                    { text: 'Curation', style: 'tableHeader' },
                                    { text: 'Structure', style: 'tableHeader' },
                                    { text: 'Research', style: 'tableHeader' }
                                ],
                                [
                                    { text: totalEvents.toString(), alignment: 'center' },
                                    { text: injections.toString(), alignment: 'center' },
                                    { text: curations.toString(), alignment: 'center' },
                                    { text: structures.toString(), alignment: 'center' },
                                    { text: research.toString(), alignment: 'center' }
                                ]
                            ]
                        },
                        layout: 'lightHorizontalLines',
                        margin: [0, 0, 0, 20]
                    },

                    // AUDIT LOG BLOCKS (New Layout)
                    { text: 'AUDIT TRAIL (IMMUTABLE)', style: 'sectionHeader', margin: [0, 0, 0, 10] },
                    ...logBlocks,

                    // FOOTER
                    { text: 'Verified by Titanium Creative Audit Service', style: 'footer', alignment: 'center', margin: [0, 50, 0, 0] }
                ],
                styles: {
                    header: {
                        fontSize: 22,
                        bold: true,
                        font: 'Roboto'
                    },
                    subheader: {
                        fontSize: 14,
                        color: '#666666',
                        font: 'Roboto',
                        characterSpacing: 2
                    },
                    sectionHeader: {
                        fontSize: 12,
                        bold: true,
                        color: '#333333',
                        decoration: 'underline'
                    },
                    tableHeader: {
                        bold: true,
                        fontSize: 10,
                        color: 'black',
                        fillColor: '#EEEEEE'
                    },
                    logMeta: {
                        fontSize: 8,
                        color: '#666666',
                        bold: true
                    },
                    logTypeHuman: {
                        fontSize: 9,
                        color: '#000000',
                        bold: true,
                        background: '#FFF8E1' // Highlight
                    },
                    logTypeSystem: {
                        fontSize: 8,
                        color: '#888888'
                    },
                    logDescription: {
                        fontSize: 10,
                        bold: true,
                        color: '#333333'
                    },
                    logContent: {
                        fontSize: 9,
                        color: '#444444',
                        font: 'Roboto'
                    },
                    footer: {
                        fontSize: 8,
                        italics: true,
                        color: '#888888'
                    }
                },
                defaultStyle: {
                    font: 'Roboto',
                    fontSize: 10
                },
                pageSize: 'A4',
                pageMargins: [40, 60, 40, 60]
            };

            // 4. GENERATE PDF
            const pdfDoc = printer.createPdfKitDocument(docDefinition);

            const chunks: Buffer[] = [];
            pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

            await new Promise<void>((resolve, reject) => {
                pdfDoc.on("end", () => resolve());
                pdfDoc.on("error", reject);
                pdfDoc.end();
            });

            const pdfBuffer = Buffer.concat(chunks);
            const pdfBase64 = pdfBuffer.toString("base64");

            logger.info(`⚖️ Audit PDF Generated for ${projectId}: ${pdfBuffer.length} bytes`);

            return {
                success: true,
                pdf: pdfBase64
            };

        } catch (error: any) {
            logger.error("Failed to generate Audit PDF:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

/**
 * GENERATE CERTIFICATE (The Notary)
 * Calculates the Human Score and creates a public, immutable record.
 */
export const generateCertificate = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
    },
    async (request) => {
        const db = getFirestore();
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required.");

        const { projectId, projectTitle } = request.data;
        const userId = request.auth.uid;

        if (!projectId) throw new HttpsError("invalid-argument", "Missing Project ID.");

        try {
            // 1. FETCH STATS
            const statsRef = db.collection('users').doc(userId).collection('projects').doc(projectId).collection('stats').doc('audit');
            const statsDoc = await statsRef.get();

            let humanChars = 0;
            let aiChars = 0;

            if (statsDoc.exists) {
                const data = statsDoc.data();
                humanChars = data?.humanChars || 0;
                aiChars = data?.aiChars || 0;
            }

            const total = humanChars + aiChars;
            let score = 0;
            if (total > 0) {
                score = (humanChars / total) * 100;
            }

            // 2. GENERATE INTEGRITY HASH
            const timestamp = new Date().toISOString();
            const rawString = `${projectId}:${userId}:${score.toFixed(2)}:${timestamp}`;
            const hash = crypto.createHash('sha256').update(rawString).digest('hex');

            // 3. CREATE PUBLIC CERTIFICATE
            const certRef = db.collection('public_certificates').doc();
            await certRef.set({
                projectId,
                userId,
                timestamp,
                humanScore: score,
                totalChars: total,
                hash,
                authorName: request.auth.token.name || 'Anonymous Author',
                projectTitle: projectTitle || 'Untitled Project'
            });

            logger.info(`📜 Certificate Generated: ${certRef.id} (Score: ${score.toFixed(1)}%)`);

            return {
                success: true,
                certificateId: certRef.id,
                score: score,
                hash: hash
            };
        } catch (error: any) {
            logger.error("Certificate Generation Failed:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
