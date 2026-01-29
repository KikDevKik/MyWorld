## 2024-05-23 - Modal Component Fragmentation
**Learning:** The application uses manual `div` implementations for modals across different components (e.g., `ForgePanel`), leading to inconsistent and missing accessibility attributes (`role="dialog"`, `aria-modal`, `aria-labelledby`) everywhere.
**Action:** Future enhancements should prioritize creating or refactoring to a shared, accessible `<Modal>` component in `src/components/ui` to enforce these patterns globally rather than patching them individually.
