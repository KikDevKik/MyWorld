import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

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

                    // AUDIT LOG TABLE
                    { text: 'AUDIT TRAIL (IMMUTABLE)', style: 'sectionHeader', margin: [0, 0, 0, 5] },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['auto', 'auto', 'auto', '*'],
                            body: [
                                [
                                    { text: 'Date / Time', style: 'tableHeader' },
                                    { text: 'Type', style: 'tableHeader' },
                                    { text: 'Component', style: 'tableHeader' },
                                    { text: 'Description', style: 'tableHeader' }
                                ],
                                ...logs.map(log => {
                                    let dateStr = 'PENDING';
                                    if (log.timestamp && typeof log.timestamp.toDate === 'function') {
                                        dateStr = log.timestamp.toDate().toISOString().replace('T', ' ').substring(0, 19);
                                    } else if (log.timestamp) {
                                        dateStr = String(log.timestamp);
                                    }

                                    return [
                                        { text: dateStr, style: 'tableCell', noWrap: true },
                                        { text: log.actionType, style: 'tableCell', bold: true },
                                        { text: log.component, style: 'tableCell' },
                                        { text: log.description, style: 'tableCell' }
                                    ];
                                })
                            ]
                        },
                        layout: {
                            fillColor: function (rowIndex: number) {
                                return (rowIndex % 2 === 0) ? '#F5F5F5' : null;
                            }
                        }
                    },

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
                    tableCell: {
                        fontSize: 9,
                        color: '#333333'
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
