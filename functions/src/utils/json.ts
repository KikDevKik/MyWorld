import * as logger from "firebase-functions/logger";
import JSON5 from 'json5';

// 🟢 JSON SANITIZER (ANTI-CRASH) - REVISION 2.1 (IRON JSON + SEARCH)
export function parseSecureJSON(jsonString: string, contextLabel: string = "Unknown", expectedType?: 'object' | 'array'): any {
  try {
    // 1. Basic Clean: Trim whitespace
    let clean = jsonString.trim();

    // 2. Aggressive Markdown Strip (Start)
    // Sometimes Gemini adds text before the block. We look for the FIRST ```json or ```
    const codeBlockStart = clean.indexOf("```");
    if (codeBlockStart !== -1) {
       // Check if it's ```json
       const jsonTag = clean.indexOf("```json", codeBlockStart);
       const startOffset = (jsonTag !== -1 && jsonTag === codeBlockStart) ? 7 : 3;

       // Cut everything before the code block
       clean = clean.substring(codeBlockStart + startOffset);
    }

    // 3. Aggressive Markdown Strip (End)
    const codeBlockEnd = clean.lastIndexOf("```");
    if (codeBlockEnd !== -1) {
       clean = clean.substring(0, codeBlockEnd);
    }

    clean = clean.trim();

    // 4. Control Characters (ASCII 0-31 excl \t \n \r) - MOVED UP
    clean = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

    // 5. FIND CANDIDATE BLOCKS (Iterative Search Strategy)
    const candidates: { start: number, char: string }[] = [];

    for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        if (char === '{' || char === '[') {
            // Filter by expectedType
            if (expectedType === 'object' && char !== '{') continue;
            if (expectedType === 'array' && char !== '[') continue;
            candidates.push({ start: i, char });
        }
    }

    if (candidates.length === 0) {
        // Fallback: Try parsing the whole string (maybe a primitive?)
        return tryParse(clean);
    }

    // 6. IRON PARSING LOOP (Try each candidate until success)
    let lastError: any = null;

    for (const { start, char } of candidates) {
        // Find matching end based on type
        // We look for the LAST occurrence of the matching brace
        // This favors the largest possible block starting at 'start'
        const endChar = char === '{' ? '}' : ']';
        const end = clean.lastIndexOf(endChar);

        if (end === -1 || end <= start) continue;

        const candidateSnippet = clean.substring(start, end + 1);

        try {
            return tryParse(candidateSnippet);
        } catch (e) {
            lastError = e;
            // Continue to next candidate (maybe nested or sequential blocks)
        }
    }

    // If loop finished without success, throw the last error
    if (lastError) {
        throw lastError;
    } else {
        // Should not happen if candidates existed but loop logic failed?
        return tryParse(clean);
    }

  } catch (error: any) {
    logger.error(`💥 [JSON PARSE ERROR] in ${contextLabel}:`, error);
    logger.debug(`💥 [JSON FAIL DUMP] Content: ${jsonString.substring(0, 200)}...`);

    // Return a controlled error object instead of throwing 500
    return {
      error: "JSON_PARSE_FAILED",
      details: error.message,
      partial_content: jsonString.substring(0, 500)
    };
  }
}

function tryParse(text: string): any {
    try {
      // Plan A: Speed (Standard JSON)
      return JSON.parse(text);
    } catch (standardError) {
      try {
        // Plan B: Robustness (JSON5 - handles trailing commas, comments, unquoted keys)
        return JSON5.parse(text);
      } catch (json5Error: any) {
        // Plan C: Hail Mary (Escaping Newlines)
        try {
           const rescued = text.replace(/\n/g, '\\n');
           return JSON5.parse(rescued);
        } catch (finalError) {
           throw json5Error; // Throw the JSON5 error as it's usually more descriptive
        }
      }
    }
}
