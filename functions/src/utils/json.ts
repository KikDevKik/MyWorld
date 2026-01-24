import * as logger from "firebase-functions/logger";
import JSON5 from 'json5';

// 🟢 JSON SANITIZER (ANTI-CRASH) - REVISION 2.0 (IRON JSON)
export function parseSecureJSON(jsonString: string, contextLabel: string = "Unknown"): any {
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

    // 4. Extract JSON Block (Find first '{' or '[' and last '}' or ']')
    // We determine if it's an object or array candidate
    const firstBrace = clean.indexOf('{');
    const firstBracket = clean.indexOf('[');
    let startIndex = -1;
    let endIndex = -1;

    // Determine start
    if (firstBrace !== -1 && firstBracket !== -1) {
       startIndex = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
       startIndex = firstBrace;
    } else if (firstBracket !== -1) {
       startIndex = firstBracket;
    }

    if (startIndex !== -1) {
        // Look for end based on start type (naive but better than nothing)
        const lastBrace = clean.lastIndexOf('}');
        const lastBracket = clean.lastIndexOf(']');
        endIndex = Math.max(lastBrace, lastBracket);

        if (endIndex !== -1 && endIndex > startIndex) {
             clean = clean.substring(startIndex, endIndex + 1);
        }
    }

    // 5. Control Characters (ASCII 0-31 excl \t \n \r)
    clean = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

    // 6. IRON PARSING STRATEGY
    try {
      // Plan A: Speed (Standard JSON)
      return JSON.parse(clean);
    } catch (standardError) {
      try {
        // Plan B: Robustness (JSON5 - handles trailing commas, comments, unquoted keys)
        // Note: JSON5 is heavier but much more forgiving for LLM output
        return JSON5.parse(clean);
      } catch (json5Error: any) {
        // Plan C: Hail Mary (Escaping Newlines)
        try {
           const rescued = clean.replace(/\n/g, '\\n');
           return JSON5.parse(rescued);
        } catch (finalError) {
           throw json5Error; // Throw the JSON5 error as it's usually more descriptive
        }
      }
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
