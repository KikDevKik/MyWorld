// Oct 2026: capa de compatibilidad sobre @google/genai (el SDK oficial actual).
// El SDK anterior (@google/generative-ai) quedó descontinuado. Para no reescribir las ~45 llamadas
// repartidas en 15 archivos, esta clase imita la parte de su API que MyWorld usa:
//   genAI.getGenerativeModel(params, requestOptions)
//     .generateContent(...)        → { response }
//     .generateContentStream(...)  → { stream, response }
//     .startChat({ history })      → sendMessage / sendMessageStream
//     .embedContent(...)           → { embedding: { values } }
//     .batchEmbedContents(...)     → { embeddings: [{ values }] }
//   response.text() / response.functionCalls() / response.candidates / usageMetadata
// Los enums (TaskType, SchemaType, HarmCategory, HarmBlockThreshold) conservan los mismos valores.
import { GoogleGenAI } from "@google/genai";

export enum TaskType {
    TASK_TYPE_UNSPECIFIED = "TASK_TYPE_UNSPECIFIED",
    RETRIEVAL_QUERY = "RETRIEVAL_QUERY",
    RETRIEVAL_DOCUMENT = "RETRIEVAL_DOCUMENT",
    SEMANTIC_SIMILARITY = "SEMANTIC_SIMILARITY",
    CLASSIFICATION = "CLASSIFICATION",
    CLUSTERING = "CLUSTERING",
}

// Mismos valores (en minúscula) que enviaba el SDK anterior: la API los acepta así hoy.
export enum SchemaType {
    STRING = "string",
    NUMBER = "number",
    INTEGER = "integer",
    BOOLEAN = "boolean",
    ARRAY = "array",
    OBJECT = "object",
}

export enum HarmCategory {
    HARM_CATEGORY_UNSPECIFIED = "HARM_CATEGORY_UNSPECIFIED",
    HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
    HARM_CATEGORY_CIVIC_INTEGRITY = "HARM_CATEGORY_CIVIC_INTEGRITY",
}

export enum HarmBlockThreshold {
    HARM_BLOCK_THRESHOLD_UNSPECIFIED = "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE",
    BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE",
    BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH",
    BLOCK_NONE = "BLOCK_NONE",
    OFF = "OFF",
}

// Igual que el SDK anterior: text() falla si la respuesta fue bloqueada.
const BAD_FINISH = new Set(["RECITATION", "SAFETY", "LANGUAGE"]);

function wrapResponse(res: any): any {
    const candidates = res?.candidates;
    const promptFeedback = res?.promptFeedback;
    return {
        candidates,
        promptFeedback,
        usageMetadata: res?.usageMetadata,
        text(): string {
            if (candidates && candidates.length > 0) {
                const c = candidates[0];
                if (c?.finishReason && BAD_FINISH.has(String(c.finishReason))) {
                    throw new Error(`[GoogleGenerativeAI Error]: Candidate was blocked due to ${c.finishReason}`);
                }
                const parts: any[] = c?.content?.parts || [];
                return parts.filter(p => typeof p?.text === "string" && !p?.thought).map(p => p.text).join("");
            }
            if (promptFeedback?.blockReason) {
                throw new Error(`[GoogleGenerativeAI Error]: Text not available. Response was blocked due to ${promptFeedback.blockReason}`);
            }
            return "";
        },
        functionCalls(): any[] | undefined {
            const parts: any[] = candidates?.[0]?.content?.parts || [];
            const calls = parts.filter(p => p?.functionCall).map(p => p.functionCall);
            return calls.length ? calls : undefined;
        },
    };
}

function toParts(input: any): any[] {
    if (typeof input === "string") return [{ text: input }];
    if (Array.isArray(input)) return input.map(p => (typeof p === "string" ? { text: p } : p));
    if (input?.text !== undefined || input?.inlineData || input?.functionResponse || input?.fileData) return [input];
    return [{ text: String(input ?? "") }];
}

// Convierte la entrada de generateContent (texto, partes o petición completa) a contents + config extra.
function normalizeRequest(input: any): { contents: any[]; extra: any } {
    if (input && typeof input === "object" && !Array.isArray(input) && Array.isArray(input.contents)) {
        const { contents, generationConfig, ...rest } = input;
        return { contents, extra: { ...(generationConfig || {}), ...rest } };
    }
    return { contents: [{ role: "user", parts: toParts(input) }], extra: {} };
}

function embedText(req: any): string {
    if (typeof req === "string") return req;
    const content = req?.content ?? req;
    if (typeof content === "string") return content;
    const parts: any[] = content?.parts || [];
    return parts.map(p => (typeof p === "string" ? p : p?.text || "")).join("\n");
}

class CompatChat {
    private history: any[];
    constructor(private model: CompatModel, params: any = {}) {
        this.history = Array.isArray(params?.history) ? [...params.history] : [];
    }

    private userContent(msg: any) {
        return { role: "user", parts: toParts(msg) };
    }

    async sendMessage(msg: any): Promise<any> {
        const user = this.userContent(msg);
        const res = await this.model.rawGenerate([...this.history, user]);
        const modelContent = res?.candidates?.[0]?.content;
        if (modelContent) this.history.push(user, { role: "model", parts: modelContent.parts || [] });
        return { response: wrapResponse(res) };
    }

    async sendMessageStream(msg: any): Promise<any> {
        const user = this.userContent(msg);
        const { stream, response } = await this.model.rawStream([...this.history, user]);
        const done = response.then((agg: any) => {
            const modelContent = agg?.candidates?.[0]?.content;
            if (modelContent) this.history.push(user, { role: "model", parts: modelContent.parts || [] });
            return agg;
        });
        return { stream, response: done };
    }

    async getHistory() {
        return this.history;
    }
}

class CompatModel {
    readonly model: string;
    private config: any;
    constructor(private client: GoogleGenAI, params: any, requestOptions?: any) {
        const { model, generationConfig, ...rest } = params || {};
        this.model = String(model || "").replace(/^models\//, "");
        this.config = { ...(generationConfig || {}), ...rest };
        if (requestOptions?.timeout) this.config.httpOptions = { timeout: requestOptions.timeout };
    }

    private buildConfig(extra: any = {}) {
        const cfg: any = { ...this.config, ...extra };
        for (const k of Object.keys(cfg)) if (cfg[k] === undefined) delete cfg[k];
        return cfg;
    }

    async rawGenerate(contents: any[], extra: any = {}): Promise<any> {
        return this.client.models.generateContent({ model: this.model, contents, config: this.buildConfig(extra) });
    }

    async rawStream(contents: any[], extra: any = {}): Promise<{ stream: AsyncGenerator<any>; response: Promise<any> }> {
        const source = await this.client.models.generateContentStream({ model: this.model, contents, config: this.buildConfig(extra) });
        // Igual que el SDK anterior: `response` se resuelve aunque nadie recorra `stream`.
        const queue: any[] = [];
        const parts: any[] = [];
        let finished = false;
        let failure: any = null;
        let notify: (() => void) | null = null;
        const wake = () => { const n = notify; notify = null; n?.(); };
        const pump = (async () => {
            let last: any = null;
            try {
                for await (const chunk of source) {
                    last = chunk;
                    for (const p of chunk?.candidates?.[0]?.content?.parts || []) {
                        const prev = parts[parts.length - 1];
                        if (typeof p?.text === "string" && !p.thought && prev && typeof prev.text === "string" && !prev.thought) {
                            prev.text += p.text;
                        } else {
                            parts.push({ ...p });
                        }
                    }
                    queue.push(chunk);
                    wake();
                }
                const c0 = last?.candidates?.[0] || {};
                return wrapResponse({
                    candidates: [{ ...c0, content: { role: "model", parts } }],
                    promptFeedback: last?.promptFeedback,
                    usageMetadata: last?.usageMetadata,
                });
            } catch (e) {
                failure = e;
                throw e;
            } finally {
                finished = true;
                wake();
            }
        })();
        pump.catch(() => { /* el error llega por stream o por response */ });
        async function* stream() {
            let i = 0;
            for (;;) {
                if (i < queue.length) { yield wrapResponse(queue[i++]); continue; }
                if (failure) throw failure;
                if (finished) return;
                await new Promise<void>(r => { notify = r; });
            }
        }
        return { stream: stream(), response: pump };
    }

    async generateContent(input: any): Promise<any> {
        const { contents, extra } = normalizeRequest(input);
        const res = await this.rawGenerate(contents, extra);
        return { response: wrapResponse(res) };
    }

    async generateContentStream(input: any): Promise<any> {
        const { contents, extra } = normalizeRequest(input);
        const out = await this.rawStream(contents, extra);
        return out;
    }

    startChat(params: any = {}) {
        // Ajustes del chat (si los hay) se suman a los del modelo.
        const { history, generationConfig, ...rest } = params || {};
        if (generationConfig || Object.keys(rest).length) {
            const m = new CompatModel(this.client, { model: this.model, ...this.config, ...(generationConfig || {}), ...rest });
            return new CompatChat(m, { history });
        }
        return new CompatChat(this, { history });
    }

    async embedContent(req: any): Promise<any> {
        const text = embedText(req);
        const config: any = {};
        if (req?.taskType) config.taskType = req.taskType;
        if (req?.outputDimensionality) config.outputDimensionality = req.outputDimensionality;
        if (req?.title) config.title = req.title;
        const res: any = await this.client.models.embedContent({ model: this.model, contents: [text], config });
        return { embedding: { values: res?.embeddings?.[0]?.values || [] } };
    }

    async batchEmbedContents(req: any): Promise<any> {
        const requests: any[] = req?.requests || [];
        if (!requests.length) return { embeddings: [] };
        const config: any = {};
        if (requests[0]?.taskType) config.taskType = requests[0].taskType;
        if (requests[0]?.outputDimensionality) config.outputDimensionality = requests[0].outputDimensionality;
        const res: any = await this.client.models.embedContent({ model: this.model, contents: requests.map(embedText), config });
        return { embeddings: (res?.embeddings || []).map((e: any) => ({ values: e?.values || [] })) };
    }
}

export class GoogleGenerativeAI {
    readonly client: GoogleGenAI;
    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }
    getGenerativeModel(params: any, requestOptions?: any): any {
        return new CompatModel(this.client, params, requestOptions);
    }
}
