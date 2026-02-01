import { AudioSegment } from '../types/editorTypes';
import { toast } from 'sonner';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts'; // Target Model

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

/**
 * Diagnostic: List available models to verify the name.
 */
async function listModels(apiKey: string) {
    try {
        const response = await fetch(`${BASE_URL}?key=${apiKey}`);
        const data = await response.json();
        console.log("📢 Available Gemini Models:", data);
    } catch (e) {
        console.warn("Failed to list models", e);
    }
}

let hasListedModels = false;

export const TTSService = {

    /**
     * Synthesizes speech for a given text segment using Gemini 2.5 (or returns null for fallback).
     *
     * @param text The text to speak.
     * @param context The context including voice profile (gender, tone, etc).
     * @returns A Promise resolving to a Blob URL of the audio, or NULL if it fails.
     */
    synthesize: async (text: string, context: AudioSegment['voiceProfile']): Promise<string | null> => {
        // 1. Check Cache
        const cacheKey = generateCacheKey(text, context);
        if (audioCache.has(cacheKey)) {
            return audioCache.get(cacheKey)!;
        }

        // 2. Prepare API Key
        const apiKey = localStorage.getItem('myworld_custom_gemini_key') || import.meta.env.VITE_GOOGLE_API_KEY;

        if (!apiKey) {
            console.error("TTS Error: No API Key found.");
            toast.error("Falta la llave de API para la voz.");
            return null;
        }

        // Diagnostic Log (Run once)
        if (!hasListedModels) {
            listModels(apiKey);
            hasListedModels = true;
        }

        // 3. Construct Prompt with Context embedded as "Stage Direction"
        const directorNote = `(Context: Speaking as a ${context.age} ${context.gender}. Tone: ${context.emotion})`;
        const fullText = `${directorNote} ${text}`;

        // 4. Call API directly
        try {
            return await callGeminiTTS(TTS_MODEL, apiKey, fullText, cacheKey);
        } catch (error) {
            console.warn(`TTS: ${TTS_MODEL} failed. Fallback to Browser.`, error);
            // Return null to trigger browser fallback in useNarrator
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
            responseModalities: ["AUDIO"] // Minimal Viable Payload for V2/V2.5
        }
    };

    console.log(`📢 SENDING TTS PAYLOAD TO ${model}:`, JSON.stringify(body, null, 2));

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
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (!part || !part.inlineData) {
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
