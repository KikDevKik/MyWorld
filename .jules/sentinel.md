## 2024-05-22 - [DOS Prevention: Stream Size Limits]
**Vulnerability:** Memory Exhaustion / Denial of Service (DoS)
**Learning:** The `streamToString` helper function buffered entire file streams into memory without any size limit. A malicious actor or an accidental upload of a massive file (e.g., 1GB+) could crash the Cloud Function instance (OOM) by exceeding the 2GiB memory limit, causing service outage.
**Prevention:** Implemented a `maxSizeBytes` check inside the stream's `data` event. The stream is now actively destroyed (`stream.destroy()`) and the promise rejected if the accumulated size exceeds 10MB (default). This "fail-fast" mechanism protects the server memory.

## 2025-02-17 - [Input Validation & Resource Limits]
**Vulnerability:** Unbounded Input Size / Type Confusion
**Learning:** Publicly accessible (authenticated) endpoints `saveDriveFile` and `summonTheTribunal` accepted arbitrarily large strings or incorrect types (objects instead of strings). This could lead to:
1.  **DoS/Cost Spike:** Sending massive payloads to AI models (Gemini) which charge by token.
2.  **Logic Errors:** Passing objects to file save functions could result in `[object Object]` corruption or crashes.
**Prevention:** Implemented explicit constants `MAX_AI_INPUT_CHARS` (100k) and `MAX_FILE_SAVE_BYTES` (5MB). Added strict `typeof` checks and `.length` validation at the entry point of sensitive Cloud Functions. This ensures we reject malformed or abusive payloads *before* they consume expensive resources.
