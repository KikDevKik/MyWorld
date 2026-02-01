import { Character } from '../types/core';
import { AudioSegment } from '../types/editorTypes';
import { generateContent } from './geminiService';

export const NarratorService = {
    /**
     * Analyzes a text scene to determine who is speaking and how.
     * Uses Gemini 3.0 to generate a semantic audio script.
     *
     * @param text - The raw text of the scene.
     * @param characters - List of available characters for identification.
     * @param sessionId - Optional session ID for the backend call.
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
                    text: "Esto es una prueba del sistema de narración.",
                    type: "NARRATION",
                    speakerId: null,
                    speakerName: "Narrador",
                    voiceProfile: { gender: "MALE", age: "ADULT", tone: "Neutral", emotion: "Neutral" },
                    from: 0,
                    to: 10 // Dummy offsets
                },
                {
                    text: "¡Funciona perfectamente!",
                    type: "DIALOGUE",
                    speakerId: "hero",
                    speakerName: "Héroe",
                    voiceProfile: { gender: "FEMALE", age: "ADULT", tone: "Excited", emotion: "Joy" },
                    from: 11,
                    to: 20
                }
             ];
        }

        // 1. Prepare Character Context for Gemini
        const characterList = characters.map(c => `- ${c.name} (ID: ${c.id})`).join('\n');

        // 2. Construct System Instruction
        const systemInstruction = `
You are a Drama Director and Voice Acting Coach.
Your task is to analyze the provided text scene and break it down into a "Semantic Audio Script" for TTS (Text-to-Speech) enactment.

### INPUT DATA:
- Characters available:
${characterList}

### RULES:
1. Break the text into logical audio chunks.
2. For EACH chunk, identify the 'type': 'NARRATION', 'DIALOGUE', or 'INTERNAL_MONOLOGUE'.
3. If 'DIALOGUE' or 'INTERNAL_MONOLOGUE', identify the 'speakerName' and 'speakerId' (use the provided IDs if possible, or fuzzy match).
4. If 'NARRATION', 'speakerName' should be "Narrator" and 'speakerId' null.
5. Analyze the emotional context to provide a 'voiceProfile':
   - 'gender': 'MALE', 'FEMALE', or 'NEUTRAL'.
   - 'age': 'CHILD', 'TEEN', 'ADULT', or 'ELDER'.
   - 'tone': Descriptive string (e.g., "Whispering", "Shouting", "Sarcastic").
   - 'emotion': Descriptive string (e.g., "Fear", "Joy", "Neutral").

### OUTPUT FORMAT:
Return ONLY a valid JSON array. Do not include markdown formatting or explanations.
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

        // 3. Construct Prompt
        const prompt = `Analyze this scene:\n\n"${text}"`;

        try {
            // 4. Call Gemini
            const responseText = await generateContent({
                prompt,
                systemInstruction,
                sessionId
            });

            // 5. Parse JSON
            // Clean markdown code blocks if present
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const segments: AudioSegment[] = JSON.parse(cleanJson);

            // 6. 🟢 REALIGN SEGMENTS (Map back to original text offsets)
            return NarratorService.realignSegments(text, segments);

        } catch (error) {
            console.error("NarratorService Analysis Failed:", error);
            // Fallback: Return the whole text as a single narration segment if analysis fails
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
            // Normalize for safer matching (ignore whitespace differences)
            const searchStr = segment.text.trim();
            if (!searchStr) continue;

            // Find the occurrence of this segment's text starting from currentIndex
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
                // If not found (AI hallucinated text mismatch), try fuzzy or skip.
                // For now, we skip highlighting for this segment but keep it in the list.
                // Or we can try to find it from the beginning if out of order (unlikely but possible).
                 console.warn(`Narrator alignment warning: Could not find "${searchStr.substring(0, 20)}..." at index ${currentIndex}`);
                 result.push(segment); // Push without offsets
            }
        }
        return result;
    }
};
