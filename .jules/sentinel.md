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

## 2025-02-18 - [Loop-Based Resource Exhaustion]
**Vulnerability:** Resource Exhaustion via Unbounded Loop
**Learning:** While individual file processing was protected (via `MAX_STREAM_SIZE_BYTES`), the `compileManuscript` function iterated through an unbounded user-provided array (`fileIds`). A user could request 1000 files, which, even if individually small, would accumulate in the `contents` array and exceed the function's memory limit (2GiB), causing an OOM crash.
**Prevention:** Added a strict limit (`MAX_FILES = 50`) on the input array length. Security limits must apply not just to atomic items but also to collections to prevent "death by a thousand cuts".
## 2025-02-18 - [DoS Prevention: Input Validation & Logging Hygiene]
**Vulnerability:** Unbounded Input Size in User Profile & Chat
**Learning:** Functions like `saveUserProfile` and `addForgeMessage` lacked input length limits, allowing potentially massive payloads (up to 1MB Firestore limit) to consume bandwidth and storage. Additionally, `chatWithGem` was logging raw massive JSON responses, risking log bloat and PII leakage.
**Prevention:**
1. Added `MAX_PROFILE_FIELD_LIMIT` (5000 chars) and `MAX_CHAT_MESSAGE_LIMIT` (30000 chars).
2. Enforced these limits in `saveUserProfile`, `addForgeMessage`, `updateForgeCharacter`, and `chatWithGem`.
3. Truncated debug logs in `chatWithGem` to 2000 chars to prevent sensitive data leakage.

## 2025-02-19 - [DoS Prevention: Unbounded Batch Operations]
**Vulnerability:** Resource Exhaustion via Unbounded Batch Loop
**Learning:** The `purgeArtifacts` function (Janitor Protocol) iterated through an unbounded user-provided array (`fileIds`) to perform deletions on Drive and Firestore. A massive payload could trigger thousands of API calls, leading to function timeout, quota exhaustion, and service degradation.
**Prevention:** Implemented `MAX_PURGE_LIMIT = 50`. Enforced strict batch size limits on all bulk operations to ensure predictable resource consumption and fail-fast behavior.

## 2024-05-24 - [CRITICAL] Wildcard CORS on Destructive Endpoint
**Vulnerability:** The `purgeEcho` function in `functions/src/guardian.ts` was configured with `cors: true` (wildcard), allowing any origin to invoke it.
**Learning:** This likely existed because `purgeEcho` was copied from a template or another function (`scanProjectDrift`) where wildcard access was intentionally enabled for beta testing/external tools. Destructive functions must always have strict origin controls.
**Prevention:**
- Enforce strict CORS lists for all `onCall` functions, especially those that modify or delete data.
- Do not copy-paste configuration objects without review.
- Add a linter rule or CI check to flag `cors: true`.

## 2024-05-24 - [WARNING] Hardcoded Origins
**Vulnerability:** The CORS configuration relies on hardcoded URLs (`https://myword-67b03.web.app`, etc.) scattered across multiple files.
**Learning:** This makes the codebase brittle and environment-dependent. Changing the deployment domain requires finding and replacing strings in multiple files.
**Prevention:**
- Centralize CORS configuration in a constant file (e.g., `functions/src/config.ts`).
- Use Environment Variables (`defineString`) to manage allowed origins dynamically per environment.

## 2025-05-24 - [DoS Prevention: Recursive Stack Overflow]
**Vulnerability:** Maximum Call Stack Size Exceeded (DoS)
**Learning:** The `compileManuscript` function used a recursive helper `injectPageBreaks` to process deeply nested content structures (from `html-to-pdfmake`). A malicious or complex Markdown document (e.g., 10,000 nested lists) could cause a stack overflow, crashing the Cloud Function instance. Recursion is dangerous when processing user-controlled tree depth.
**Prevention:** Replaced the recursive algorithm with an iterative approach using a stack. Iterative solutions move the state from the call stack (limited) to the heap (limited only by available memory), which is much more robust for deep trees.
