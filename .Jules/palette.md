## 2026-05-24 - Accessibility for Selection Controls
**Learning:** When using buttons to act as mutually exclusive selection controls (like radio buttons), using `role="radiogroup"` with `role="radio"` and `aria-checked` is semantically superior to simple buttons. It communicates the "one-of-many" relationship to screen readers.
**Action:** Always check toggle button groups. If they represent mutually exclusive options (A vs B), refactor them into a radio group pattern.
