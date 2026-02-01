import { callFunction } from './api';

/**
 * Converts a browser File object to a Google Generative AI compatible Part.
 *
 * @param file - The file to convert (image or audio).
 * @returns A promise that resolves to an object containing inlineData.
 */
export async function fileToGenerativePart(file: File): Promise<{ inlineData: { mimeType: string; data: string } }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                const base64Data = reader.result.split(',')[1];
                resolve({
                    inlineData: {
                        data: base64Data,
                        mimeType: file.type
                    },
                });
            } else {
                reject(new Error("Failed to read file"));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

interface GenerateContentParams {
    prompt: string;
    systemInstruction?: string;
    sessionId?: string;
}

/**
 * Wrapper to call Gemini via the Backend Cloud Function 'chatWithGem'.
 * This enables "Text-to-Reasoning" capabilities without exposing API keys on the client.
 */
export async function generateContent(params: GenerateContentParams): Promise<string> {
    const { prompt, systemInstruction, sessionId } = params;

    // Use a temporary session ID if none provided, though backend might expect a valid doc.
    const effectiveSessionId = sessionId || `temp-narrator-${Date.now()}`;

    try {
        const data = await callFunction<{ response: string }>('chatWithGem', {
            query: prompt,
            systemInstruction: systemInstruction,
            sessionId: effectiveSessionId,
            // We pass context as empty/null since Narrator provides everything in the prompt
            activeFileContent: "",
            activeFileName: "Narrator Context"
        });
        return data.response;
    } catch (error) {
        console.error("Gemini Generation Error:", error);
        throw error;
    }
}
