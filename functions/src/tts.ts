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
        enforceAppCheck: true,
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
