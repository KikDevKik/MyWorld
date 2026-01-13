## 2024-05-22 - [DOS Prevention: Stream Size Limits]

**Vulnerability:** Memory Exhaustion / Denial of Service (DoS)
**Learning:** The `streamToString` helper function buffered entire file streams into memory without any size limit. A malicious actor or an accidental upload of a massive file (e.g., 1GB+) could crash the Cloud Function instance (OOM) by exceeding the 2GiB memory limit, causing service outage.
**Prevention:** Implemented a `maxSizeBytes` check inside the stream's `data` event. The stream is now actively destroyed (`stream.destroy()`) and the promise rejected if the accumulated size exceeds 10MB (default). This "fail-fast" mechanism protects the server memory.
