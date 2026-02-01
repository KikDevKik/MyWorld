import { AudioSegment } from '../types/editorTypes';
import { toast } from 'sonner';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TTS_MODEL = 'gemini-2.0-flash-exp'; // Minimal Viable Payload Target

// Simple in-memory cache for the session
// Key: Segment Text + Voice Profile Hash -> Value: Blob URL
const audioCache = new Map<string, string>();

interface TTSRequest {
    text: string;
    voiceProfile: AudioSegment['voiceProfile'];
}

/**
 * Generates a unique key for caching based on text and voice settings.
 */
const generateCacheKey = (text: string, profile: AudioSegment['voiceProfile']): string => {
    return `${text}|${profile.gender}|${profile.age}|${profile.tone}|${profile.emotion}`;
};

export const TTSService = {

    /**
     * Synthesizes speech for a given text segment using Gemini 2.0.
     *
     * @param text The text to speak.
     * @param context The context including voice profile (gender, tone, etc).
     * @returns A Promise resolving to a Blob URL of the audio.
     */
    synthesize: async (text: string, context: AudioSegment['voiceProfile']): Promise<string | null> => {
        // 1. Check Cache
        const cacheKey = generateCacheKey(text, context);
        if (audioCache.has(cacheKey)) {
            return audioCache.get(cacheKey)!;
        }

        // 2. Prepare API Key
        // Priority: BYOK (localStorage) > Environment Variable
        const apiKey = localStorage.getItem('myworld_custom_gemini_key') || import.meta.env.VITE_GOOGLE_API_KEY;

        if (!apiKey) {
            console.error("TTS Error: No API Key found.");
            toast.error("Falta la llave de API para la voz.");
            return null;
        }

        // 3. Construct Prompt with Context embedded as "Stage Direction"
        // This keeps the character's soul (Gender/Age) without breaking the JSON schema.
        const directorNote = `(Context: Speaking as a ${context.age} ${context.gender}. Tone: ${context.emotion})`;
        const fullText = `${directorNote} ${text}`;

        // 4. Call API directly (no fallback logic anymore)
        try {
            return await callGeminiTTS(TTS_MODEL, apiKey, fullText, cacheKey);
        } catch (error) {
            console.error("TTS Generation Failed.", error);
            toast.error("Error al generar el audio.");
            return null;
        }
    },

    /**
     * Clears the audio cache.
     */
    clearCache: () => {
        // Revoke all URLs to free memory
        audioCache.forEach((url) => URL.revokeObjectURL(url));
        audioCache.clear();
    }
};

/**
 * Helper to call the Gemini API.
 */
async function callGeminiTTS(model: string, apiKey: string, promptText: string, cacheKey: string): Promise<string> {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [{
                text: promptText
            }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"] // This is the ONLY required flag for V2
        }
    };

    console.log("📢 SENDING TTS PAYLOAD:", JSON.stringify(body, null, 2));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("TTS API Error Body:", errorText);
        throw new Error(`API Error ${response.status}: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // Parse Response to find Audio Blob
    // Expected structure for Audio model: candidates[0].content.parts[0].inlineData (base64)

    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (!part || !part.inlineData) {
        // Sometimes it returns text if it refused to generate audio
        if (part?.text) {
             console.warn("TTS Model returned text instead of audio:", part.text);
             throw new Error("Model returned text instead of audio: " + part.text);
        }
        throw new Error("Invalid response structure from TTS model.");
    }

    const base64Audio = part.inlineData.data;
    const mimeType = part.inlineData.mimeType || 'audio/mp3';

    // Convert Base64 to Blob
    const binaryString = window.atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Update Cache
    audioCache.set(cacheKey, blobUrl);

    return blobUrl;
}
