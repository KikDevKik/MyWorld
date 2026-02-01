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

        // Filter specifically for "flash" models as requested
        if (data.models) {
             console.log("🔎 FLASH MODELS:", data.models.filter((m: any) => m.name.includes("flash")));
        }
    } catch (e) {
        console.warn("Failed to list models", e);
    }
}

let hasListedModels = false;

/**
 * Helper: Adds a valid WAV header to raw PCM data.
 * @param pcmData The raw PCM audio data.
 * @param sampleRate The sample rate (e.g., 24000).
 * @param numChannels Number of channels (default 1 for Gemini).
 */
function addWavHeader(pcmData: ArrayBuffer, sampleRate: number, numChannels: number = 1): ArrayBuffer {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const numSamples = pcmData.byteLength / 2; // 16-bit = 2 bytes per sample

    // RIFF Chunk
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true); // File size
    writeString(view, 8, 'WAVE');

    // fmt Chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Chunk size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // Byte rate
    view.setUint16(32, numChannels * 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data Chunk
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);

    // Concatenate Header + PCM
    const wavBuffer = new Uint8Array(header.byteLength + pcmData.byteLength);
    wavBuffer.set(new Uint8Array(header), 0);
    wavBuffer.set(new Uint8Array(pcmData), header.byteLength);

    return wavBuffer.buffer;
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

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

    // 📥 DEEP DIAGNOSTIC: Log Raw Response
    console.log("📥 GEMINI RAW RESPONSE:", JSON.stringify(data, null, 2));

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

    // 🔍 BASE64 HEADER CHECK
    console.log("🔍 BASE64 HEADER:", base64Audio.substring(0, 50));

    // Detect MIME Type from API or Default
    let mimeType = part.inlineData.mimeType || 'audio/wav';
    console.log("🎧 RAW MIME TYPE:", mimeType);

    // Extract Sample Rate if available (e.g., "audio/L16;rate=24000")
    let sampleRate = 24000; // Default fallback
    const rateMatch = mimeType.match(/rate=(\d+)/);
    if (rateMatch) {
        sampleRate = parseInt(rateMatch[1], 10);
        console.log(`⏱️ Detected Sample Rate: ${sampleRate}Hz`);
    }

    // Convert Base64 to Raw Bytes
    const binaryString = window.atob(base64Audio);
    const pcmBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        pcmBytes[i] = binaryString.charCodeAt(i);
    }

    // WRAPPING LOGIC: If it's Raw PCM (L16), wrap it in WAV
    let finalBlob: Blob;

    if (mimeType.includes("L16") || mimeType.includes("pcm")) {
        console.log("🛠️ Wrapping Raw PCM in WAV Header...");
        const wavBuffer = addWavHeader(pcmBytes.buffer, sampleRate, 1); // 1 Channel Mono
        finalBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    } else {
        // Assume it's already a valid container (MP3/WAV)
        finalBlob = new Blob([pcmBytes], { type: mimeType });
    }

    const blobUrl = URL.createObjectURL(finalBlob);

    // Update Cache
    audioCache.set(cacheKey, blobUrl);

    return blobUrl;
}
