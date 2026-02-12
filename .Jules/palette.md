

## 2025-02-14 - Chat Loading State
**Learning:** Found `ChatInput` already importing `Loader2` but not using it. Enabling `VITE_JULES_MODE=true` allows bypassing auth for local UI testing, but headless screenshots can be tricky with complex providers blocking render.
**Action:** Always check imports for unused components that hint at intended features. Use `VITE_JULES_MODE` for quicker UI iteration.
