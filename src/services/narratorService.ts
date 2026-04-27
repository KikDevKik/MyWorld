import { Character } from '../types/core';
import { AudioSegment } from '../types/editorTypes';
import { toast } from 'sonner';
import { callFunction } from './api';

// Patterns that should NOT be read aloud
const IGNORE_PATTERNS = [
    /^-\s*\[TIMELINE/i,
    /^\[TIMELINE/i,
    /^\s*[-_*]{3,}\s*$/,
    /^\s*#+\s*.*$/,
    /^\s*<!--[\s\S]*?-->/
];

export const NarratorService = {
    /**
     * Analyzes a text scene to determine who is speaking and how.
     * Routes through the backend Cloud Function to keep the Gemini API key server-side.
     */
    analyzeScene: async (
        text: string,
        characters: Character[],
        sessionId?: string
    ): Promise<AudioSegment[]> => {

        // 🟢 GHOST MODE MOCK
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            console.log("👻 Narrator Mock Mode Active");
            await new Promise(r => setTimeout(r, 1000));

            const dialogueIndex = text.indexOf('—');
            if (dialogueIndex > 5) {
                return [
                    {
                        text: text.substring(0, dialogueIndex),
                        type: "NARRATION",
                        speakerId: null,
                        speakerName: "Narrator",
                        voiceProfile: { gender: "MALE", age: "ADULT", tone: "Neutral", emotion: "Neutral" },
                        from: 0,
                        to: dialogueIndex
                    },
                    {
                        text: text.substring(dialogueIndex),
                        type: "DIALOGUE",
                        speakerId: "mock-char-1",
                        speakerName: "Unknown Character",
                        voiceProfile: { gender: "FEMALE", age: "ADULT", tone: "Fearful", emotion: "Fear" },
                        from: dialogueIndex,
                        to: text.length
                    }
                ];
            }

            return [{
                text: text.substring(0, Math.min(text.length, 50)),
                type: "NARRATION",
                speakerId: null,
                speakerName: "Narrator",
                voiceProfile: { gender: "MALE", age: "ADULT", tone: "Neutral", emotion: "Neutral" },
                from: 0,
                to: Math.min(text.length, 50)
            }];
        }

        // 🟢 BACKEND CALL — Gemini API key lives on the server (Firebase Secret Manager)
        // No API key is exposed to the browser.
        try {
            const characterList = characters.map(c => `- ${c.name} (ID: ${c.id})`).join('\n');

            const result = await callFunction<{ segments: AudioSegment[] }>('analyzeScene', {
                text,
                characterList,
                sessionId
            });

            if (!result || !result.segments || result.segments.length === 0) {
                throw new Error("Empty response from analyzeScene function.");
            }

            return NarratorService.realignSegments(text, result.segments);

        } catch (error) {
            console.error("NarratorService Analysis Failed:", error);
            toast.error("Error al analizar la escena. Intenta de nuevo.");
            return [{
                text: text,
                type: 'NARRATION',
                speakerId: null,
                speakerName: 'Narrator',
                voiceProfile: { gender: 'NEUTRAL', age: 'ADULT', tone: 'Neutral', emotion: 'Neutral' },
                from: 0,
                to: text.length
            }];
        }
    },

    /**
     * Maps the AI-generated segments back to the original text to find absolute offsets.
     * Automatically fills "gaps" (missed narration) with a default Narrator segment.
     */
    realignSegments: (originalText: string, segments: AudioSegment[]): AudioSegment[] => {
        let currentIndex = 0;
        const result: AudioSegment[] = [];

        for (const segment of segments) {
            const searchStr = segment.text.trim();
            if (!searchStr) continue;

            const foundIndex = originalText.indexOf(searchStr, currentIndex);

            if (foundIndex !== -1) {
                if (foundIndex > currentIndex) {
                    const missedText = originalText.substring(currentIndex, foundIndex).trim();
                    const isMetadata = IGNORE_PATTERNS.some(pattern => pattern.test(missedText));

                    if (missedText.length > 0 && !isMetadata) {
                        result.push({
                            text: originalText.substring(currentIndex, foundIndex),
                            type: 'NARRATION',
                            speakerId: null,
                            speakerName: 'Narrator',
                            voiceProfile: { gender: 'NEUTRAL', age: 'ADULT', tone: 'Neutral', emotion: 'Neutral' },
                            from: currentIndex,
                            to: foundIndex
                        });
                    } else if (isMetadata) {
                        console.log("Skipping Metadata Segment:", missedText);
                    }
                }

                const end = foundIndex + searchStr.length;
                result.push({ ...segment, from: foundIndex, to: end });
                currentIndex = end;
            } else {
                console.warn(`Narrator alignment warning: Could not find segment at index ${currentIndex}`);
                result.push(segment);
            }
        }

        if (currentIndex < originalText.length) {
            const tailText = originalText.substring(currentIndex);
            const isTailMetadata = IGNORE_PATTERNS.some(pattern => pattern.test(tailText.trim()));

            if (tailText.trim().length > 0 && !isTailMetadata) {
                result.push({
                    text: tailText,
                    type: 'NARRATION',
                    speakerId: null,
                    speakerName: 'Narrator',
                    voiceProfile: { gender: 'NEUTRAL', age: 'ADULT', tone: 'Neutral', emotion: 'Neutral' },
                    from: currentIndex,
                    to: originalText.length
                });
            }
        }

        return result;
    }
};
