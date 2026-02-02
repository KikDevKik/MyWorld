import { AudioSegment, VoiceProfile } from '../types/editorTypes';
import { toast } from 'sonner';
import { callFunction } from './api';

// Simple in-memory cache for the session
// Key: Segment Text + Voice Profile Hash -> Value: Blob URL
const audioCache = new Map<string, string>();

interface TTSRequest {
    text: string;
    voiceProfile: AudioSegment['voiceProfile'];
}

interface TTSResponse {
    audioData: string;
    mimeType: string;
}

/**
 * Generates a unique key for caching based on text and voice settings.
 */
const generateCacheKey = (text: string, profile: AudioSegment['voiceProfile']): string => {
    return `${text}|${profile.gender}|${profile.age}|${profile.tone}|${profile.emotion}`;
};

/**
 * Helper: Adds a valid WAV header to raw PCM data.
 * @param pcmData The raw PCM audio data.
 * @param sampleRate The sample rate (e.g., 24000).
 * @param numChannels Number of channels (default 1 for Gemini).
 */
function addWavHeader(pcmData: ArrayBuffer, sampleRate: number, numChannels: number = 1): ArrayBuffer {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // Derived Parameters
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8; // Should be 2 for 16-bit Mono
    const byteRate = sampleRate * blockAlign; // Should be 48000 for 24kHz

    // RIFF Chunk
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true); // File size
    writeString(view, 8, 'WAVE');

    // fmt Chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Chunk size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true); // Sample Rate
    view.setUint32(28, byteRate, true);   // Byte Rate
    view.setUint16(32, blockAlign, true); // Block Align
    view.setUint16(34, bitsPerSample, true); // Bits per sample

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
     * Synthesizes speech for a given text segment using Gemini 2.5 (via Backend Proxy).
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

        // 2. Call Backend (Secure Proxy)
        try {
            const data = await callFunction<TTSResponse>('generateSpeech', {
                text: text,
                voiceProfile: context
            });

            if (!data || !data.audioData) {
                throw new Error("Empty response from TTS Service");
            }

            const { audioData, mimeType } = data;

            // 3. Process Response (Frontend Logic: Decode & Wrap)
            // Extract Sample Rate if available (e.g., "audio/L16;rate=24000")
            let sampleRate = 24000; // Default fallback
            const rateMatch = mimeType.match(/rate=(\d+)/);
            if (rateMatch) {
                sampleRate = parseInt(rateMatch[1], 10);
            }

            // Convert Base64 to Raw Bytes
            const binaryString = window.atob(audioData);
            const pcmBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                pcmBytes[i] = binaryString.charCodeAt(i);
            }

            // WRAPPING LOGIC: If it's Raw PCM (L16), wrap it in WAV
            let finalBlob: Blob;

            if (mimeType.includes("L16") || mimeType.includes("pcm")) {
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

        } catch (error) {
            console.warn(`TTS: Backend Generation failed. Fallback to Browser.`, error);
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
