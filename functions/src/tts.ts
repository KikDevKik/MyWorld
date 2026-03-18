import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAIKey } from "./utils/security";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const TTS_MODEL = 'gemini-2.5-pro-preview-tts';

// Local Interface Definitions
interface VoiceProfile {
    gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
    age: 'CHILD' | 'TEEN' | 'ADULT' | 'ELDER';
    tone?: string;
    emotion?: string;
}

/**
 * Helper: Maps Voice Profile to "Voice Anchor" adjectives for consistency.
 */
const getVoiceDescription = (profile: VoiceProfile): string => {
    // 1. Base Anchor based on Age & Gender
    let anchor = "Neutral";

    if (profile.gender === 'MALE') {
        if (profile.age === 'CHILD') anchor = "Young, High-pitched Male";
        else if (profile.age === 'TEEN') anchor = "Energetic, Youthful Male";
        else if (profile.age === 'ADULT') anchor = "Deep, Resonant Male";
        else if (profile.age === 'ELDER') anchor = "Raspy, Weathered, Old Male";
    } else if (profile.gender === 'FEMALE') {
        if (profile.age === 'CHILD') anchor = "Young, Soft-spoken Female";
        else if (profile.age === 'TEEN') anchor = "Bright, Clear Female";
        else if (profile.age === 'ADULT') anchor = "Warm, Melodic Female";
        else if (profile.age === 'ELDER') anchor = "Shaky, Wise, Old Female";
    }

    // 2. Add Tone context if provided (e.g., "Sarcastic", "Whispering")
    if (profile.tone) {
        anchor += `, ${profile.tone}`;
    }

    return anchor;
};

export const generateSpeech = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        secrets: [googleApiKey],
        memory: "2GiB",
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Login requerido.");
        }

        const { text, voiceProfile } = request.data;

        if (!text) {
            throw new HttpsError("invalid-argument", "Falta el texto.");
        }

        // Use default profile if missing
        const profile = voiceProfile || { gender: 'NEUTRAL', age: 'ADULT' };

        try {
            const apiKey = getAIKey(request.data, googleApiKey.value());
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: TTS_MODEL
            });

            const voiceDesc = getVoiceDescription(profile);
            const directorNote = `(Context: Voice: ${voiceDesc}. Emotion: ${profile.emotion || 'Neutral'})`;
            const fullText = `${directorNote} ${text}`;

            logger.info(`📢 TTS Generation for ${request.auth.uid}: ${voiceDesc}`);

            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullText }]
                }],
                generationConfig: {
                    responseModalities: ["AUDIO"]
                }
            } as any);

            const response = result.response;
            const candidate = response.candidates?.[0];
            const part = candidate?.content?.parts?.[0];

            if (!part || !part.inlineData) {
                if (part?.text) {
                    logger.warn("TTS Model returned text instead of audio:", part.text);
                    throw new HttpsError("internal", "Model returned text instead of audio");
                }
                throw new HttpsError("internal", "Invalid response structure from TTS model.");
            }

            return {
                audioData: part.inlineData.data,
                mimeType: part.inlineData.mimeType || 'audio/wav'
            };

        } catch (error: any) {
            logger.error("Error en generateSpeech:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

const ANALYZE_MODEL_PRIMARY = 'gemini-2.5-flash';
const ANALYZE_MODEL_FALLBACK = 'gemini-2.0-flash';
const SCENE_ANALYSIS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ANALYZE_SYSTEM_INSTRUCTION = `
You are an expert Audiobook Narrator and Director.
Your task is to analyze the provided text scene and prepare it for a full Text-to-Speech performance.

### CRITICAL RULES:
1. **STORY COVERAGE**: You MUST include 100% of the *story* text (dialogue, narration, monologue) verbatim.
2. **METADATA EXCLUSION**: Exclude Timeline markers, notes in brackets, structural markers like "---".
3. **SEQUENCE**: Return segments in the exact order they appear in the text.
4. **SEGMENTATION**: NARRATION for descriptive text; DIALOGUE for spoken text; INTERNAL_MONOLOGUE for thoughts.
5. **ATTRIBUTION**: Identify speakerName and speakerId for DIALOGUE/MONOLOGUE. Narrator for NARRATION.
6. **VOICE PROFILE**: gender: MALE/FEMALE/NEUTRAL, age: CHILD/TEEN/ADULT/ELDER, tone and emotion descriptors.

### OUTPUT FORMAT:
Return ONLY a valid JSON array.
[{ "text": "...", "type": "DIALOGUE", "speakerId": "char_id", "speakerName": "Name", "voiceProfile": { "gender": "FEMALE", "age": "ADULT", "tone": "Sharp", "emotion": "Anger" } }]
`;

/**
 * analyzeScene — Narrator service backend
 * Analyzes a text scene server-side using Gemini and returns AudioSegment[] JSON.
 * The API key is sourced from Firebase Secret Manager, never exposed to the client.
 */
export const analyzeScene = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        secrets: [googleApiKey],
        memory: "1GiB",
        timeoutSeconds: 120,
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Login requerido.");
        }

        const { text, characterList } = request.data;
        if (!text) {
            throw new HttpsError("invalid-argument", "Falta el texto para analizar.");
        }

        const apiKey = getAIKey(request.data, googleApiKey.value());

        const systemWithCharacters = `${ANALYZE_SYSTEM_INSTRUCTION}\n### CHARACTERS AVAILABLE:\n${characterList || '(None provided)'}`;

        const tryModel = async (model: string): Promise<any[]> => {
            const url = `${SCENE_ANALYSIS_BASE_URL}/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemWithCharacters }] },
                    contents: [{ parts: [{ text: `Analyze this scene:\n\n"${text}"` }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            if (!response.ok) {
                throw new Error(`Model ${model} error ${response.status}`);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) throw new Error("No response text from model.");

            const clean = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(clean);
        };

        try {
            logger.info(`📖 analyzeScene for ${request.auth.uid} (${text.length} chars)`);

            let segments: any[];
            try {
                segments = await tryModel(ANALYZE_MODEL_PRIMARY);
            } catch (primaryError) {
                logger.warn(`⚠️ Primary model failed, using fallback:`, primaryError);
                segments = await tryModel(ANALYZE_MODEL_FALLBACK);
            }

            return { segments };

        } catch (error: any) {
            logger.error("Error en analyzeScene:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

