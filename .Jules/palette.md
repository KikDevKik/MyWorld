## 2026-05-24 - Accessibility for Selection Controls
**Learning:** When using buttons to act as mutually exclusive selection controls (like radio buttons), using `role="radiogroup"` with `role="radio"` and `aria-checked` is semantically superior to simple buttons. It communicates the "one-of-many" relationship to screen readers.
**Action:** Always check toggle button groups. If they represent mutually exclusive options (A vs B), refactor them into a radio group pattern.

## 2026-05-25 - Stateful Icon Buttons
**Learning:** Icon-only buttons that toggle a global mode (like Delete Mode) require `aria-pressed` to communicate their active state. Relying solely on visual cues (color change) or tooltip text updates leaves screen reader users unaware of the state change.
**Action:** For any toggle-style action button, implement `aria-pressed={isActive}` and keep the `aria-label` static (e.g., "Toggle Delete Mode") rather than changing it dynamically.
