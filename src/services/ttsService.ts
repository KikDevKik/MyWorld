import { AudioSegment } from '../types/editorTypes';
import { toast } from 'sonner';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const PRIMARY_MODEL = 'gemini-2.5-flash-preview-tts'; // As requested
const FALLBACK_MODEL = 'gemini-2.0-flash-exp';

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
     * Synthesizes speech for a given text segment using Gemini 2.5/2.0.
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

        // 3. Construct Prompt for Audio Generation
        // We need to instruct the model *how* to speak.
        const promptText = `
Generate audio for the following text: "${text}"

Speaker Profile:
- Gender: ${context.gender}
- Age: ${context.age}
- Tone: ${context.tone}
- Emotion: ${context.emotion}

Return ONLY the audio data.
`;

        // 4. Try Primary Model
        try {
            return await callGeminiTTS(PRIMARY_MODEL, apiKey, promptText, cacheKey);
        } catch (error) {
            console.warn(`TTS: ${PRIMARY_MODEL} failed, trying fallback ${FALLBACK_MODEL}.`, error);
            try {
                return await callGeminiTTS(FALLBACK_MODEL, apiKey, promptText, cacheKey);
            } catch (fallbackError) {
                console.error("TTS Generation Failed completely.", fallbackError);
                toast.error("Error al generar el audio.");
                return null;
            }
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
async function callGeminiTTS(model: string, apiKey: string, prompt: string, cacheKey: string): Promise<string> {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                responseMimeType: "audio/mp3"
            }
        })
    });

    if (!response.ok) {
        throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse Response to find Audio Blob
    // Expected structure for Audio model: candidates[0].content.parts[0].inlineData (base64)
    // Or sometimes it might return a fileUri if configured differently.

    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (!part || !part.inlineData) {
        // Sometimes it returns text if it refused to generate audio
        if (part?.text) {
             console.warn("TTS Model returned text instead of audio:", part.text);
             throw new Error("Model returned text instead of audio.");
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
