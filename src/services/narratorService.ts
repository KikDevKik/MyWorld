import { Character } from '../types/core';
import { AudioSegment } from '../types/editorTypes';
import { toast } from 'sonner';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const BRAIN_MODEL_PRIMARY = 'gemini-3-flash-preview'; // Exact string requested by user
const BRAIN_MODEL_FALLBACK = 'gemini-2.0-flash'; // Safe fallback

export const NarratorService = {
    /**
     * Analyzes a text scene to determine who is speaking and how.
     * Uses Gemini to generate a semantic audio script.
     *
     * @param text - The raw text of the scene.
     * @param characters - List of available characters for identification.
     * @param sessionId - Optional session ID for tracking.
     * @returns A promise resolving to an ordered list of AudioSegments.
     */
    analyzeScene: async (
        text: string,
        characters: Character[],
        sessionId?: string
    ): Promise<AudioSegment[]> => {

        // 🟢 GHOST MODE MOCK
        if (import.meta.env.VITE_JULES_MODE === 'true') {
             console.log("👻 Narrator Mock Mode Active");
             await new Promise(r => setTimeout(r, 1000)); // Fake latency
             return [
                {
                    text: text.substring(0, Math.min(text.length, 50)),
                    type: "NARRATION",
                    speakerId: null,
                    speakerName: "Narrador",
                    voiceProfile: { gender: "MALE", age: "ADULT", tone: "Neutral", emotion: "Neutral" },
                    from: 0,
                    to: Math.min(text.length, 50)
                }
             ];
        }

        // 1. Prepare API Key
        const apiKey = localStorage.getItem('myworld_custom_gemini_key') || import.meta.env.VITE_GOOGLE_API_KEY;
        if (!apiKey) {
            toast.error("Falta la llave de API.");
            throw new Error("No API Key");
        }

        // 2. Prepare Context
        const characterList = characters.map(c => `- ${c.name} (ID: ${c.id})`).join('\n');

        const systemInstruction = `
You are a Drama Director and Voice Acting Coach.
Your task is to analyze the provided text scene and break it down into a "Semantic Audio Script" for TTS (Text-to-Speech) enactment.

### INPUT DATA:
- Characters available:
${characterList}

### RULES:
1. Break the text into logical audio chunks (sentences or phrases).
2. For EACH chunk, identify the 'type': 'NARRATION', 'DIALOGUE', or 'INTERNAL_MONOLOGUE'.
3. If 'DIALOGUE' or 'INTERNAL_MONOLOGUE', identify the 'speakerName' and 'speakerId' (use the provided IDs if possible, or fuzzy match).
4. If 'NARRATION', 'speakerName' should be "Narrator" and 'speakerId' null.
5. Analyze the emotional context to provide a 'voiceProfile':
   - 'gender': 'MALE', 'FEMALE', or 'NEUTRAL'.
   - 'age': 'CHILD', 'TEEN', 'ADULT', or 'ELDER'.
   - 'tone': Descriptive string (e.g., "Whispering", "Shouting", "Sarcastic").
   - 'emotion': Descriptive string (e.g., "Fear", "Joy", "Neutral").

### OUTPUT FORMAT:
Return ONLY a valid JSON array. Do not include markdown formatting.
Schema:
[
  {
    "text": "The text content",
    "type": "DIALOGUE",
    "speakerId": "char_id",
    "speakerName": "Character Name",
    "voiceProfile": {
      "gender": "FEMALE",
      "age": "ADULT",
      "tone": "Sharp",
      "emotion": "Anger"
    }
  },
  ...
]
`;

        // 3. Call Gemini Direct (Client-Side)
        try {
            let result: AudioSegment[];
            try {
                result = await callGeminiBrain(BRAIN_MODEL_PRIMARY, apiKey, text, systemInstruction);
            } catch (primaryError) {
                console.warn(`Brain ${BRAIN_MODEL_PRIMARY} failed. Using fallback ${BRAIN_MODEL_FALLBACK}.`, primaryError);
                result = await callGeminiBrain(BRAIN_MODEL_FALLBACK, apiKey, text, systemInstruction);
            }

            // 4. Realign
            return NarratorService.realignSegments(text, result);

        } catch (error) {
            console.error("NarratorService Analysis Failed:", error);
            toast.error("Error al analizar la escena. Revisa tu llave o conexión.");
            // Fallback: Return single segment
            return [{
                text: text,
                type: 'NARRATION',
                speakerId: null,
                speakerName: 'Narrator',
                voiceProfile: {
                    gender: 'NEUTRAL',
                    age: 'ADULT',
                    tone: 'Neutral',
                    emotion: 'Neutral'
                },
                from: 0,
                to: text.length
            }];
        }
    },

    /**
     * Maps the AI-generated segments back to the original text to find absolute offsets.
     */
    realignSegments: (originalText: string, segments: AudioSegment[]): AudioSegment[] => {
        let currentIndex = 0;
        const result: AudioSegment[] = [];

        for (const segment of segments) {
            const searchStr = segment.text.trim();
            if (!searchStr) continue;

            const foundIndex = originalText.indexOf(searchStr, currentIndex);

            if (foundIndex !== -1) {
                const end = foundIndex + searchStr.length;
                result.push({
                    ...segment,
                    from: foundIndex,
                    to: end
                });
                currentIndex = end;
            } else {
                 console.warn(`Narrator alignment warning: Could not find segment at index ${currentIndex}`);
                 result.push(segment);
            }
        }
        return result;
    }
};

/**
 * Helper to call Gemini Text Generation
 */
async function callGeminiBrain(model: string, apiKey: string, userPrompt: string, systemInstruction: string): Promise<AudioSegment[]> {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [{
                parts: [{ text: `Analyze this scene:\n\n"${userPrompt}"` }]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Brain API Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
        throw new Error("No response text from Brain.");
    }

    // Clean and Parse
    try {
        const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Failed to parse JSON from Brain:", textResponse);
        throw new Error("Invalid JSON format");
    }
}
