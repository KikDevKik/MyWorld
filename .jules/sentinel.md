## 2024-03-08 - [Sanitize Prompts in Laboratory]
**Vulnerability:** Prompt injection vulnerability in `classifyResource` (functions/src/laboratory.ts) due to unescaped user inputs.
**Learning:** External variables injected directly into prompt literals can break context boundaries and alter instructions.
**Prevention:** Always use `escapePromptVariable` for variables like `fileName`, `mimeType`, and `snippet` before string interpolation inside LLM prompts.