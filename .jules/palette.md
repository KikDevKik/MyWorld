## 2024-05-24 - Modal Consistency and Accessibility
**Learning:** Custom implementations of common UI patterns (like Modals) often miss critical accessibility features (ARIA roles, focus management, keyboard traps) that are already solved in shared components.
**Action:** Always check for existing shared components (e.g., `<Modal />`) before building custom UI elements. Refactor existing custom implementations to use shared components to ensure consistent behavior and accessibility across the application.
