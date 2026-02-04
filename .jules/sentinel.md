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
**Learning:** While individual file processing was protected (via `MAX_STREAM_SIZE_BYTES`), the `compileManuscript` function iterated through an unbounded user-provided array (`fileIds`). A user could request 1000 files, which, even if individually small, would accumulate in the `contents` array and exceed the function's memory limit (2GiB), causing OOM crash.
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

## 2025-02-20 - [DoS Prevention & CORS Hardening]
**Vulnerability:** Unbounded Query Result Size / Wildcard CORS
**Learning:** The `scanProjectDrift` function attempted to fetch *all* chunks for a project (`.get()`) without a limit. For large projects (>10k chunks), this would exceed the function's memory limit (1GiB) and crash. Additionally, `cors: true` was left active from a beta phase, exposing the endpoint to any origin.
**Prevention:**
1. Implemented `MAX_SCAN_LIMIT` (2000) to ensure predictable memory usage.
2. Replaced `cors: true` with strict `ALLOWED_ORIGINS` to close the open door.
3. Added warning logs when the limit is hit to inform the user/system that analysis might be partial.

## 2025-05-24 - [Broken Access Control: Client-Side Trust]
**Vulnerability:** Client-Side Enforcement of Blacklist
**Learning:** The `analyzeNexusBatch` function in `functions/src/nexus_scan.ts` trusted the client to provide the `ignoredTerms` array for filtering candidates. A malicious or modified client could simply omit these terms, allowing "Hard Rejected" (blacklisted) entities to reappear in the system, effectively bypassing the blacklist protocol.
**Prevention:**
1. Do not rely on client inputs for security or critical business logic rules.
2. Implemented a server-side fetch of the blacklist (`settings/general`) directly within the Cloud Function.
3. Merged the server-side authoritative list with the client's list (defense in depth), ensuring that even if the client input is manipulated, the persistent blacklist is enforced.

## 2025-05-25 - [DoS Prevention: Unbounded Batch Analysis]
**Vulnerability:** Resource Exhaustion via Unbounded Batch Input
**Learning:** The `analyzeNexusBatch` function allowed an unlimited number of file IDs in the `fileIds` array. A malicious actor could provide thousands of files, triggering massive parallel API calls to Google Drive (DoS) and potentially crashing the instance by accumulating unlimited text content in memory before AI processing.
**Prevention:**
1. Implemented `MAX_BATCH_SIZE = 50` to limit the number of files processed per request.
2. Implemented `MAX_TOTAL_CONTENT_CHARS = 500000` to cap the total memory usage of the accumulated text content, ensuring the function fails safely (truncates) rather than crashing.

## 2025-05-26 - [SSRF/LFI Prevention in PDF Compilation]
**Vulnerability:** Server-Side Request Forgery / Local File Inclusion via `img` tags
**Learning:** `pdfmake` (via `pdfkit`) in a Node.js environment treats image paths as local file paths by default. The `sanitizeHtml` function was using a blacklist that allowed `img` tags, assuming they were safe or inert. However, `html-to-pdfmake` converts them into a format that `pdfmake` attempts to resolve, leading to potential LFI if a user provides `<img src="file:///etc/passwd">`.
**Prevention:** Added `img` (and `video`, `audio`, `source`, `picture`) to the `prohibitedTags` list in `sanitizeHtml`. Security sanitizers should default to "deny all" (allowlist) rather than "allow all except X" (blocklist) whenever possible, or strictly validate attributes like `src` to allow only specific protocols (`http/https`) if the tag is required.

## 2025-05-27 - [DoS Prevention: Input Length Limits]
**Vulnerability:** Unbounded Input Size in Core Functions
**Learning:** Functions like `analyzeConnection`, `createForgeSession`, `forgeToolExecution`, and `crystallizeNode` lacked explicit input length validation. A malicious user could send massive strings (e.g., 10MB names) to exhaust memory or Firestore quotas.
**Prevention:**
1. Defined strict constants: `MAX_ENTITY_NAME_CHARS` (100), `MAX_SESSION_NAME_CHARS` (200), `MAX_CONNECTION_CONTEXT_CHARS` (5000).
2. Enforced these limits at the entry point of all public Callable Functions.
3. Used `typeof` checks to prevent type confusion before length validation.

## 2025-05-28 - [CRITICAL] Error Message Leakage (Auth Module)
**Vulnerability:** Authentication functions (`exchangeAuthCode`, `refreshDriveToken`) threw raw `HttpsError("internal", error.message)`, exposing Google API error details and potential token fragments to the client.
**Learning:** Developers prioritized debugging speed over security, bypassing safe error wrapping. This pattern was widespread across `functions/src/index.ts` and `auth.ts`, risking leakage of sensitive internal state.
**Prevention:** Enforced use of `handleSecureError` wrapper for the Auth module (`functions/src/auth.ts`) as a critical first step. This wrapper logs the full error server-side for debugging but returns a generic, sanitized message to the client. Future work should extend this to `index.ts`.

## 2025-05-29 - [CRITICAL] Hardcoded Secrets in Client Bundle
**Vulnerability:** Hardcoded API Key in Source Code
**Learning:** `src/lib/firebase.ts` contained a fallback configuration object with a hardcoded Google API Key. This practice exposes sensitive credentials in the source code (and potentially the public bundle), bypassing environment-based security controls.
**Prevention:**
1. Removed the hardcoded fallback completely.
2. Implemented a strict runtime check that throws a CRITICAL SECURITY error if the environment variable is missing.
3. Created `.env.example` to guide developers on required configuration. Security must take precedence over convenience.

## 2025-05-30 - [DoS Prevention: Batch Limit & Input Validation]
**Vulnerability:** Unbounded Batch Size & Filename Length
**Learning:** The `trashDriveItems` function allowed processing an unlimited number of files in parallel, creating a DoS vector. Additionally, `renameDriveFolder` had no maximum length check, allowing potentially problematic long filenames.
**Prevention:** Implemented `MAX_BATCH_SIZE = 50` and `MAX_FILENAME_LENGTH = 255` in `folder_manager.ts` to strictly bound these operations.

## 2025-05-31 - [CRITICAL] Ghost Mode Secrets Leak
**Vulnerability:** Public Exposure of Refresh Tokens in Ghost Mode.
**Learning:** Recursive wildcards (`{document=**}`) grant access to ALL subcollections, including sensitive ones like `system_secrets` created by backend processes.
**Prevention:** Use explicit subcollection matching for public/exception rules.
