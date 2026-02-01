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
