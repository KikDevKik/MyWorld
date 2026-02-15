## 2025-02-19 - Loading State Feedback
**Learning:** Adding a loading spinner inside the submit button (replacing the icon) provides immediate, delightful feedback for async actions, superior to just disabling the interface.
**Action:** Implement `isLoading` prop pattern on all action buttons that trigger async flows.

## 2025-02-19 - Ghost Mode Verification
**Learning:** `VITE_JULES_MODE=true` enables robust UI testing by mocking auth and backend responses (e.g., `useDirectorChat` simulation), allowing frontend verification without a real backend.
**Action:** Use Ghost Mode for all UI state verification scripts.
