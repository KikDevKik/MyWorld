import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { getAIKey, escapeDriveQuery } from "./utils/security";
import { GeminiEmbedder } from "./utils/vector_utils";
import { generateDraftContent } from "./templates/forge";
import { FolderRole, ProjectConfig } from "./types/project";
import { updateFirestoreTree } from "./utils/tree_utils";
import { ingestFile } from "./ingestion";
import { TitaniumFactory } from "./services/factory";
import { TitaniumEntity, EntityTrait } from "./types/ontology";
import { TitaniumGenesis } from "./services/genesis";
import * as crypto from 'crypto';

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// 🛡️ SENTINEL SECURITY CONSTANTS
const MAX_HISTORY_ITEMS = 100;
const MAX_HISTORY_CHARS = 100000;

// Helper to get config
async function getProjectConfigLocal(userId: string): Promise<ProjectConfig> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

  const defaultConfig: ProjectConfig = {
    canonPaths: [],
    resourcePaths: [],
    activeBookContext: ""
  };

  if (!doc.exists) return defaultConfig;
  return { ...defaultConfig, ...doc.data() };
}

// Helper to resolve role -> folderId
const getFolderIdForRole = (config: ProjectConfig, role: FolderRole): string | null => {
    return config.folderMapping?.[role] || null;
}

// ─── Helpers para el modo answers (StartingAssistant) ───────────────────────

/** Extrae el primer nombre propio de la premisa (primera palabra capitalizada
 *  que no sea artículo/preposición). Devuelve null si no encuentra nada. */
function extractNameFromPremise(premise: string): string | null {
    if (!premise) return null;
    const stopWords = new Set(['Un', 'Una', 'El', 'La', 'Los', 'Las', 'En', 'De',
                               'Del', 'Por', 'Para', 'Con', 'Sin', 'A', 'Su', 'Sus']);
    const word = premise.split(/\s+/).find(
        w => w.length > 2 && /^[A-ZÁÉÍÓÚÑ]/.test(w) && !stopWords.has(w)
    );
    return word ? word.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '') : null;
}

/** Extrae el primer nombre propio de un texto libre. */
function extractNameFromText(text: string): string | null {
    return extractNameFromPremise(text);
}

/** Construye una cadena de identidad estilística para guardar en project_config. */
function buildStyleIdentity(answers: any): string {
    const parts: string[] = [];
    if (answers.readerAge)   parts.push(`Lector ideal: ${answers.readerAge}`);
    if (answers.readerReads) parts.push(`Referencias: ${answers.readerReads}`);
    if (answers.worldType)   parts.push(`Género/Mundo: ${answers.worldType}`);
    if (answers.writerStyle) parts.push(`Estilo: ${answers.writerStyle}`);
    return parts.join('. ');
}

/** Genera el contenido Markdown del archivo Premisa.md */
function buildPremisaContent(answers: any): string {
    const writerStyleLabel =
        answers.writerStyle === 'plotter'  ? 'Plotter — planifica antes de escribir' :
        answers.writerStyle === 'pantser'  ? 'Pantser — descubre escribiendo' :
                                             'Híbrido — esqueleto + improvisación';
    return `# Premisa

> **La pregunta narrativa de tu historia**

${answers.premise || '*(pendiente de definir)*'}

---

## Género y tono
${answers.worldType || '*(pendiente de definir)*'}

## Dirección emocional
${answers.emotionalEnding || '*(pendiente de definir)*'}

## El lector ideal
**Edad:** ${answers.readerAge || '*(pendiente de definir)*'}
**Referencias:** ${answers.readerReads || '*(pendiente de definir)*'}

## Estilo del autor
${writerStyleLabel}

## Promesa al lector
*(pendiente de definir — ¿qué experiencia se llevará el lector al cerrar el libro?)*

## Tema central
*(pendiente de definir — ¿de qué trata realmente esta historia, debajo de la trama?)*

---
*Este archivo es tu brújula. Puedes editarlo en cualquier momento.*
`;
}

/** Detects whether antagonist description is a group/system rather than an individual */
function isGroupAntagonist(raw: string): boolean {
    const lower = raw.toLowerCase();
    const groupKeywords = ['gobierno', 'sociedad', 'sistema', 'institución', 'institution',
        'organización', 'organization', 'corporación', 'corporation', 'régimen', 'empire',
        'imperio', 'church', 'iglesia', 'estado', 'authority', 'autoridad', 'order', 'orden',
        'guild', 'gremio', 'league', 'liga', 'faction', 'facción', 'cult', 'culto'];
    if (groupKeywords.some(kw => lower.includes(kw))) return true;
    return raw.split(' ').length > 4;
}

/** Returns a display name: short text used directly, long text gets a generic label */
function getAntagonistDisplayName(raw: string): string {
    if (!raw) return 'Antagonista';
    return raw.split(' ').length <= 4 ? raw : 'La Oposición';
}

/** Genera el contenido del archivo del antagonista con secciones ricas */
function buildAntagonistContent(answers: any, protagonistName: string): string {
    const antagonistRaw = (answers.antagonist || '').trim();
    const protagonistDesire = (answers.protagonistDesire || 'su objetivo').toLowerCase();

    const isGroup = isGroupAntagonist(antagonistRaw);
    const displayName = getAntagonistDisplayName(antagonistRaw);
    const roleLabel = isGroup ? 'Fuerza antagonista' : 'Antagonista';
    const traitLabel = isGroup ? '[COLLECTIVE]' : '[SENTIENT]';

    const groupSections = `
## Figuras dentro del sistema
*(pendiente de definir — ¿hay individuos que encarnen o representen esta fuerza?)*

## Cómo se manifiesta en la vida cotidiana
*(pendiente de definir)*`;

    const individualSections = `
## Apariencia
*(pendiente de definir)*`;

    return `# ${displayName}

> **Role:** ${roleLabel}
> **Traits:** ${traitLabel}

## Naturaleza
${antagonistRaw || '*(pendiente de definir)*'}

## Motivación
*(pendiente de definir — ${isGroup
    ? 'los mejores antagonistas sistémicos tienen una lógica interna coherente. ¿Por qué este sistema existe y se perpetúa?'
    : `el mejor antagonista tiene sus propias razones lógicas. No necesita ser malvado, solo querer algo incompatible con ${protagonistName}.`})*

## Cómo se opone a ${protagonistName}
Impide que ${protagonistName} pueda: ${protagonistDesire}.
${isGroup ? groupSections : individualSections}

## Métodos
*(pendiente de definir — ¿cómo ejerce su oposición? ¿directamente, indirectamente, sistemáticamente?)*

## Arco
*(pendiente de definir — ¿cambia, cae, o permanece? ¿puede ser redimido?)*
`;
}

/** Genera el contenido del archivo de la regla del mundo */
function buildRuleContent(answers: any): string {
    const rule = (answers.worldRule || '').trim();
    return `# ${rule}

> **Tipo:** Regla fundamental del mundo

## Enunciado
${rule}

## Origen
*(pendiente de definir — ¿quién o qué creó esta regla? ¿desde cuándo existe?)*

## Consecuencias de romperla
*(pendiente de definir — ¿qué le pasa a quien la rompe?)*

## Excepciones conocidas
*(pendiente de definir — ¿hay grietas en la regla? ¿alguien la ha roto antes?)*

## Cómo afecta al protagonista
*(pendiente de definir)*
`;
}

/** Genera el contenido del archivo Arquitectura del Mundo */
function buildWorldContent(answers: any): string {
    return `# Arquitectura del Mundo

## Género
${answers.worldType || '*(pendiente de definir)*'}

## Estética visual
*(pendiente de definir — colores predominantes, materiales, sensación general)*

## Sociedad
*(pendiente de definir — ¿cómo es la gente común en este mundo?)*

## Estructura política
*(pendiente de definir)*

## Tecnología y época
*(pendiente de definir — ¿industrial, medieval, futurista, mezcla?)*

## Lugares importantes
*(pendiente de definir — los crearás en la carpeta de Lugares cuando los descubras)*
`;
}

/** Asegura que una subcarpeta existe dentro de un parent, creándola si no existe */
async function ensureSubFolder(
    drive: any,
    parentId: string,
    folderName: string
): Promise<string> {
    try {
        const res = await drive.files.list({
            q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id)',
            pageSize: 1,
        });
        if (res.data.files?.length) {
            return res.data.files[0].id!;
        }
        const created = await drive.files.create({
            requestBody: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            },
            fields: 'id',
        });
        return created.data.id!;
    } catch (e) {
        logger.warn(`⚠️ ensureSubFolder: failed to ensure '${folderName}' in ${parentId}`, e);
        return parentId; // graceful fallback: use parent itself
    }
}

/**
 * GENESIS PROTOCOL (The Big Bang)
 * Takes a Socratic chat history, extracts entities, and batch-creates them in Drive.
 */
export const genesisManifest = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 540, // 9 minutes for batch operations
    memory: "1GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { chatHistory, accessToken, answers } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Access Token required.");

    // answers-mode (StartingAssistant) or chatHistory-mode (GenesisWizard)
    const useAnswersMode = answers && typeof answers === 'object';

    if (!useAnswersMode) {
        if (!chatHistory || !Array.isArray(chatHistory)) {
            throw new HttpsError("invalid-argument", "Either answers or chatHistory is required.");
        }
        // 🛡️ SENTINEL CHECK: Input Validation (DoS Prevention)
        if (chatHistory.length > MAX_HISTORY_ITEMS) {
            throw new HttpsError("invalid-argument", `History too long. Max ${MAX_HISTORY_ITEMS} messages.`);
        }
        let totalChars = 0;
        for (const h of chatHistory) {
            if (!h.role || !h.message || typeof h.role !== 'string' || typeof h.message !== 'string') {
                throw new HttpsError("invalid-argument", "Invalid history format. Expected {role: string, message: string}.");
            }
            totalChars += h.message.length;
        }
        if (totalChars > MAX_HISTORY_CHARS) {
            throw new HttpsError("invalid-argument", `Total history size exceeds limit (${MAX_HISTORY_CHARS} chars).`);
        }
    }

    const userId = request.auth.uid;
    const db = getFirestore();
    const config = await getProjectConfigLocal(userId);

    // 1. SETUP FOLDERS (Resolver & Validator)
    const peopleFolderId = getFolderIdForRole(config, FolderRole.ENTITY_PEOPLE);
    const worldFolderId = getFolderIdForRole(config, FolderRole.WORLD_CORE);
    const manuscriptFolderId = getFolderIdForRole(config, FolderRole.SAGA_MAIN);
    const bestiaryFolderId = getFolderIdForRole(config, FolderRole.ENTITY_BESTIARY);

    // 🟢 RESOLVE ITEMS FOLDER (New Requirement)
    let itemsFolderId = getFolderIdForRole(config, FolderRole.ENTITY_OBJECTS);

    if (!peopleFolderId || !worldFolderId || !manuscriptFolderId || !bestiaryFolderId) {
        throw new HttpsError("failed-precondition", "Project structure incomplete. Please run 'Create Standard' first.");
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    // 🟢 DYNAMIC STRUCTURE REPAIR: Ensure OBJETOS exists if missing
    if (!itemsFolderId) {
        logger.info("🛠️ Genesis: OBJETOS folder missing in config. Attempting resolution...");
        try {
            const rootId = config.folderId;
            if (rootId) {
                // Check if exists in Drive
                // 🛡️ SECURITY: Escape rootId
                const q = `'${escapeDriveQuery(rootId)}' in parents and name = 'OBJETOS' and trashed = false`;
                const res = await drive.files.list({ q, fields: "files(id)" });

                if (res.data.files && res.data.files.length > 0) {
                    itemsFolderId = res.data.files[0].id!;
                    logger.info("   -> Found existing OBJETOS folder.");
                } else {
                    // Create it
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: "OBJETOS",
                            mimeType: "application/vnd.google-apps.folder",
                            parents: [rootId]
                        },
                        fields: "id"
                    });
                    itemsFolderId = createRes.data.id!;
                    logger.info("   -> Created new OBJETOS folder.");
                }

                // Update Config Mapping (Async, non-blocking)
                if (itemsFolderId) {
                     const mapUpdate: any = {};
                     mapUpdate[`folderMapping.${FolderRole.ENTITY_OBJECTS}`] = itemsFolderId;
                     db.collection("users").doc(userId).collection("profile").doc("project_config").update(mapUpdate).catch(e => logger.warn("Config update failed", e));
                }
            }
        } catch (e) {
            logger.warn("⚠️ Genesis: Failed to resolve OBJETOS folder. Items may be misplaced.", e);
        }
    }

    try {
        // 2. ENTITY RESOLUTION — two paths depending on input type
        let narrative_style = 'TPS';
        let entities: any[];

        if (useAnswersMode) {
            // ── MODO ANSWERS (StartingAssistant) ──────────────────────────────
            // Los datos ya están estructurados: no llamamos a la IA para extraer
            // lo que el escritor ya respondió explícitamente.

            // Nombre del protagonista: campo explícito primero, luego fallback semántico
            const protagonistName = (answers as any).protagonistName?.trim()
                || extractNameFromPremise(answers.premise)
                || 'Protagonista';

            const protagonistTraits = [
                answers.protagonistDesire     && `Deseo: ${answers.protagonistDesire}`,
                answers.protagonistObstacle   && `Obstáculo: ${answers.protagonistObstacle}`,
                answers.protagonistMisbelief  && `Creencia errónea: ${answers.protagonistMisbelief}`,
            ].filter(Boolean).join('\n') || '(pendiente de definir por el autor)';

            // Contenido rico del archivo del protagonista
            const protagonistFileContent = `# ${protagonistName}

**Rol:** Protagonista
${(answers as any).protagonist ? `**Descripción:** ${(answers as any).protagonist}\n` : ''}
---

## Deseo
${answers.protagonistDesire || '*(pendiente de definir)*'}

## Obstáculo
${answers.protagonistObstacle || '*(pendiente de definir)*'}

## Creencia errónea
${answers.protagonistMisbelief || '*(pendiente de definir)*'}

## Apariencia
*(pendiente de definir)*

## Arco de transformación
*(pendiente de definir)*
`;

            entities = [
                // Protagonista — siempre presente si hay answers
                {
                    category: 'PERSON',
                    name: protagonistName,
                    role: 'Protagonista',
                    age: 'Desconocida',
                    traits: protagonistTraits,
                    content: protagonistFileContent,
                },
                // Capítulo inicial
                {
                    category: 'CHAPTER',
                    title: 'Capítulo 01',
                    summary: answers.premise || 'El inicio de la historia.',
                    content: `# Capítulo 01\n\n> *${answers.premise || 'Una historia que está por comenzar.'}*\n\n---\n\n`,
                },
            ];

            // Guardar styleIdentity derivado de las respuestas del escritor
            const styleIdentity = buildStyleIdentity(answers);
            if (styleIdentity) {
                await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
                    styleIdentity,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }

            logger.info(`🎯 Genesis (answers mode): ${entities.length} entities resolved without AI extraction.`);

        } else {
            // ── MODO CHAT HISTORY (GenesisWizard — sin cambios) ───────────────
            const finalApiKey = getAIKey(request.data, googleApiKey.value());
            const genAI = new GoogleGenerativeAI(finalApiKey);
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST,
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: {
                    temperature: TEMP_PRECISION,
                    responseMimeType: "application/json"
                } as any
            });

            const historyText = (chatHistory as any[]).map((h: any) => `${h.role}: ${h.message}`).join("\n");
            const prompt = `
                TASK: Analyze the Socratic Chat and extract the structural elements of the story.

                EXTRACT THE NARRATIVE VOICE (POV):
                - Determine if the user chose First Person (FPS), Third Person (TPS), or Cinematic.
                - Valid values: 'FPS', 'TPS', 'CINEMATIC'. Default: 'TPS'.

                EXTRACT ENTITIES (The Taxonomy):
                - Entities must be classified by 'category' (PERSON, CREATURE, LOCATION, OBJECT).
                1. PERSON: Characters with agency/dialogue. (Max 3). REQUIRED METADATA: 'role', 'age'.
                2. CREATURE: Monsters, creatures, or non-sentient threats.
                3. LOCATION: Key settings/places. (Max 2).
                4. OBJECT: Important objects, artifacts.
                5. CHAPTER: The inciting incident or first chapter idea. (Max 1).

                LANGUAGE INSTRUCTION:
                Detect the language of the CHAT HISTORY.
                All output values (traits, summaries, content) MUST BE in the SAME LANGUAGE as the CHAT HISTORY.

                OUTPUT SCHEMA (JSON):
                {
                  "narrative_style": "FPS" | "TPS" | "CINEMATIC",
                  "entities": [
                    { "category": "PERSON", "name": "Name", "role": "Protagonist / Antagonist / NPC", "age": "30", "traits": "..." },
                    { "category": "CHAPTER", "title": "Chapter Title", "summary": "...", "content": "..." }
                  ]
                }

                CHAT HISTORY:
                ${historyText}
            `;

            const result = await model.generateContent(prompt);
            const jsonText = result.response.text();
            const parsedResult = parseSecureJSON(jsonText, "GenesisExtraction");

            if (!parsedResult || !parsedResult.entities) {
                throw new HttpsError("internal", "Failed to parse Genesis extraction.");
            }

            narrative_style = parsedResult.narrative_style || 'TPS';
            entities = parsedResult.entities;

            if (parsedResult.narrative_style) {
                await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
                    styleIdentity: parsedResult.narrative_style,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        }

        // 3. EXECUTION (The Materialization)
        const createdFiles: any[] = [];

        // Helper to find subfolder in Manuscript (e.g., "Libro_01")
        let targetManuscriptFolder = manuscriptFolderId;
        try {
            // 🛡️ SECURITY: Escape manuscriptFolderId
            const q = `'${escapeDriveQuery(manuscriptFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const res = await drive.files.list({ q, pageSize: 1, orderBy: 'name' });
            if (res.data.files && res.data.files.length > 0) {
                targetManuscriptFolder = res.data.files[0].id!;
                logger.info(`📚 Genesis: Found subfolder for manuscript: ${res.data.files[0].name}`);
            }
        } catch (e) {
            logger.warn("⚠️ Genesis: Failed to check subfolders, using root Manuscript folder.");
        }

        for (const item of entities) {
            const projectId = (config as any).folderId || "unknown_genesis";
            let folderId = "";
            let traits: EntityTrait[] = [];
            let role = "Entity";
            let context = "";

            if (item.category === 'PERSON') {
                folderId = peopleFolderId;
                traits = ['sentient'];
                role = item.role || "NPC";
                // Usar contenido rico si fue generado explícitamente (modo answers con protagonistName)
                context = item.content
                    || `## 📝 Descripción\n${item.traits}\n\n## 🏛️ Historia\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'LOCATION') {
                folderId = worldFolderId;
                traits = ['locatable'];
                role = "Setting";
                context = `## 📝 Descripción\n${item.traits}\n\n## 🌍 Geografía\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'CREATURE') {
                folderId = bestiaryFolderId;
                traits = ['tangible', 'sentient'];
                role = "Monster";
                context = `## 📝 Descripción\n${item.traits}\n\n## 🐾 Comportamiento\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'OBJECT') {
                folderId = itemsFolderId || worldFolderId;
                traits = ['tangible'];
                role = "Item";
                context = `## 📝 Descripción\n${item.traits}\n\n## 💎 Propiedades\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'CHAPTER') {
                folderId = targetManuscriptFolder;
                const fileName = `${item.title.replace(/[^a-zA-Z0-9\-_ ]/g, '')}.md`;
                const content = generateDraftContent({
                    title: item.title,
                    type: 'draft',
                    summary: item.summary,
                    content: item.content
                });

                try {
                    const fileRes = await drive.files.create({
                        requestBody: {
                            name: fileName,
                            parents: [folderId],
                            mimeType: 'text/markdown'
                        },
                        media: {
                            mimeType: 'text/markdown',
                            body: content
                        },
                        fields: 'id, name, webViewLink'
                    });
                    if (fileRes.data.id) {
                         createdFiles.push({
                            id: fileRes.data.id,
                            name: fileName,
                            category: item.category,
                            link: fileRes.data.webViewLink
                        });
                        // Auto-index logic for chapters...
                    }
                } catch(e) { logger.error("Chapter creation failed", e); }
                continue;
            } else {
                continue;
            }

            // 🚀 TITANIUM GENESIS: BIRTH ENTITY
            try {
                const genesisResult = await TitaniumGenesis.birth({
                    userId: userId,
                    name: item.name,
                    context: context,
                    targetFolderId: folderId,
                    accessToken: accessToken,
                    projectId: projectId,
                    role: role,
                    aiKey: getAIKey(request.data, googleApiKey.value()),
                    inferredTraits: traits,
                    attributes: {
                        age: item.age,
                        category: item.category // Support for explicit ECS Category
                    }
                });

                createdFiles.push({
                    id: genesisResult.fileId,
                    name: `${item.name}.md`,
                    category: item.category,
                    link: genesisResult.webViewLink
                });

            } catch (err: any) {
                logger.error(`❌ Genesis: Failed to create ${item.name}:`, err);
            }
        }

        // 4. ARCHIVOS DE MUNDO — solo en modo answers (datos estructurados del escritor)
        if (useAnswersMode && worldFolderId) {

            // 4a. Premisa.md → en UNIVERSE (worldFolderId)
            try {
                const premisaContent = buildPremisaContent(answers);
                const premisaRes = await drive.files.create({
                    requestBody: {
                        name: 'Premisa.md',
                        parents: [worldFolderId],
                        mimeType: 'text/markdown'
                    },
                    media: {
                        mimeType: 'text/markdown',
                        body: premisaContent
                    },
                    fields: 'id, name, webViewLink'
                });
                if (premisaRes.data.id) {
                    createdFiles.push({
                        id: premisaRes.data.id,
                        name: 'Premisa.md',
                        category: 'WORLD_FILE',
                        link: premisaRes.data.webViewLink
                    });
                    logger.info('📄 Genesis: Premisa.md created in UNIVERSE folder.');
                }
            } catch (e) {
                logger.warn('⚠️ Genesis: Failed to create Premisa.md (non-critical).', e);
            }

            // 4b. Arquitectura del Mundo.md → en UNIVERSE (worldFolderId)
            if (answers.worldType?.trim()) {
                try {
                    const worldContent = buildWorldContent(answers);
                    const worldRes = await drive.files.create({
                        requestBody: {
                            name: 'Arquitectura del Mundo.md',
                            parents: [worldFolderId],
                            mimeType: 'text/markdown'
                        },
                        media: {
                            mimeType: 'text/markdown',
                            body: worldContent
                        },
                        fields: 'id, name, webViewLink'
                    });
                    if (worldRes.data.id) {
                        createdFiles.push({
                            id: worldRes.data.id,
                            name: 'Arquitectura del Mundo.md',
                            category: 'WORLD_FILE',
                            link: worldRes.data.webViewLink
                        });
                        logger.info('🌍 Genesis: Arquitectura del Mundo.md created in UNIVERSE folder.');
                    }
                } catch (e) {
                    logger.warn('⚠️ Genesis: Failed to create world architecture file (non-critical).', e);
                }
            }

            // 4c. Antagonista.md → con contenido rico (usando TitaniumGenesis)
            if (answers.antagonist?.trim().length > 8) {
                const protagonistNameForAntagFile = (answers as any).protagonistName?.trim()
                    || extractNameFromPremise(answers.premise)
                    || 'el protagonista';
                try {
                    const antagonistContent = buildAntagonistContent(answers, protagonistNameForAntagFile);
                    const antagonistName = getAntagonistDisplayName(answers.antagonist);
                    const antagonistTraits: any[] = isGroupAntagonist(answers.antagonist) ? ['collective'] : ['sentient'];
                    const projectId = (config as any).folderId || 'unknown_genesis';
                    const antagonistResult = await TitaniumGenesis.birth({
                        userId: userId,
                        name: antagonistName,
                        context: antagonistContent,
                        targetFolderId: peopleFolderId,
                        accessToken: accessToken,
                        projectId: projectId,
                        role: isGroupAntagonist(answers.antagonist) ? 'Fuerza antagonista' : 'Antagonista',
                        aiKey: getAIKey(request.data, googleApiKey.value()),
                        inferredTraits: antagonistTraits,
                        attributes: { category: 'PERSON' }
                    });
                    createdFiles.push({
                        id: antagonistResult.fileId,
                        name: `${antagonistName}.md`,
                        category: 'PERSON',
                        link: antagonistResult.webViewLink
                    });
                    logger.info(`🦹 Genesis: Antagonista '${antagonistName}' materializado en CHARACTERS.`);
                } catch (e) {
                    logger.warn('⚠️ Genesis: Failed to create antagonist file (non-critical).', e);
                }
            }

            // 4d. Regla del mundo → subcarpeta RULES dentro de UNIVERSE (worldFolderId)
            if (answers.worldRule?.trim()) {
                try {
                    const rulesFolderId = await ensureSubFolder(drive, worldFolderId, 'RULES');
                    const ruleContent = buildRuleContent(answers);
                    const ruleName = answers.worldRule.trim().slice(0, 60);
                    const ruleRes = await drive.files.create({
                        requestBody: {
                            name: `${ruleName}.md`,
                            parents: [rulesFolderId],
                            mimeType: 'text/markdown'
                        },
                        media: {
                            mimeType: 'text/markdown',
                            body: ruleContent
                        },
                        fields: 'id, name, webViewLink'
                    });
                    if (ruleRes.data.id) {
                        createdFiles.push({
                            id: ruleRes.data.id,
                            name: `${ruleName}.md`,
                            category: 'WORLD_RULE',
                            link: ruleRes.data.webViewLink
                        });
                        logger.info(`📜 Genesis: Rule '${ruleName}' created in UNIVERSE/RULES.`);
                    }
                } catch (e) {
                    logger.warn('⚠️ Genesis: Failed to create world rule file (non-critical).', e);
                }
            }
        }

        return {
            success: true,
            files: createdFiles,
            message: `Génesis completado. ${createdFiles.length} archivos materializados.`
        };

    } catch (error: any) {
        logger.error("🔥 Genesis Protocol Failed:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);
