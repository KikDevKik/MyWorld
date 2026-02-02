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
You are an expert Audiobook Narrator and Director.
Your task is to analyze the provided text scene and prepare it for a full Text-to-Speech performance.

### INPUT DATA:
- Characters available:
${characterList}

### CRITICAL RULES:
1. **FULL COVERAGE**: You MUST include 100% of the input text verbatim. Do not skip narration, descriptions, or internal monologues.
2. **SEQUENCE**: Return segments in the exact order they appear in the text.
3. **SEGMENTATION**: Break the text into logical audio chunks.
    - **NARRATION**: Use this for descriptive text, actions, and unquoted thoughts.
    - **DIALOGUE**: Use this for spoken text (usually in quotes).
    - **INTERNAL_MONOLOGUE**: Use this for thoughts (often in italics or specific markers).
4. **ATTRIBUTION**:
    - For DIALOGUE/MONOLOGUE: Identify the 'speakerName' and 'speakerId'.
    - For NARRATION: 'speakerName' must be "Narrator".
5. **VOICE PROFILE**:
    - Analyze emotional context for 'voiceProfile'.
    - 'gender': 'MALE', 'FEMALE', 'NEUTRAL'.
    - 'age': 'CHILD', 'TEEN', 'ADULT', 'ELDER'.
    - 'tone': Descriptive (e.g., "Whispering", "Excited").
    - 'emotion': Descriptive (e.g., "Fear", "Joy").

### OUTPUT FORMAT:
Return ONLY a valid JSON array.
Schema:
[
  {
    "text": "The exact text content from the source",
    "type": "DIALOGUE", // or NARRATION
    "speakerId": "char_id", // or null for Narrator
    "speakerName": "Character Name", // or "Narrator"
    "voiceProfile": {
      "gender": "FEMALE",
      "age": "ADULT",
      "tone": "Sharp",
      "emotion": "Anger"
    }
  }
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

            // 4. Realign and Fill Gaps
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
     * CRITICAL: Automatically fills "gaps" (missed narration) with a default Narrator segment.
     */
    realignSegments: (originalText: string, segments: AudioSegment[]): AudioSegment[] => {
        let currentIndex = 0;
        const result: AudioSegment[] = [];

        for (const segment of segments) {
            const searchStr = segment.text.trim();
            if (!searchStr) continue;

            const foundIndex = originalText.indexOf(searchStr, currentIndex);

            if (foundIndex !== -1) {
                // DETECT GAP
                if (foundIndex > currentIndex) {
                    const missedText = originalText.substring(currentIndex, foundIndex).trim();
                    if (missedText.length > 0) {
                         // Insert Bridge Segment for missed narration
                         result.push({
                            text: originalText.substring(currentIndex, foundIndex), // Keep original spacing for audio? Or trim? Better keep raw.
                            type: 'NARRATION',
                            speakerId: null,
                            speakerName: 'Narrator',
                            voiceProfile: {
                                gender: 'NEUTRAL',
                                age: 'ADULT',
                                tone: 'Neutral',
                                emotion: 'Neutral'
                            },
                            from: currentIndex,
                            to: foundIndex
                         });
                    }
                }

                // Push Actual Segment
                const end = foundIndex + searchStr.length;
                result.push({
                    ...segment,
                    from: foundIndex,
                    to: end
                });
                currentIndex = end;
            } else {
                 console.warn(`Narrator alignment warning: Could not find segment at index ${currentIndex}`);
                 // If we can't find it, we skip adding it to maintain the strict timeline,
                 // OR we just push it without offsets (which might break highlighting).
                 // Best effort: Push it, but it won't have valid highlighting.
                 result.push(segment);
            }
        }

        // CHECK TAIL
        if (currentIndex < originalText.length) {
            const tailText = originalText.substring(currentIndex);
            if (tailText.trim().length > 0) {
                result.push({
                    text: tailText,
                    type: 'NARRATION',
                    speakerId: null,
                    speakerName: 'Narrator',
                    voiceProfile: {
                        gender: 'NEUTRAL',
                        age: 'ADULT',
                        tone: 'Neutral',
                        emotion: 'Neutral'
                    },
                    from: currentIndex,
                    to: originalText.length
                });
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
