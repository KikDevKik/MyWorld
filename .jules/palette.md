## 2026-01-28 - Disconnected Form Labels in Modals
**Learning:** Found a pattern where form labels (`<label>`) were visually styled but not programmatically linked to inputs via `htmlFor`/`id` in `NodeEditModal`. This makes the form inaccessible to screen readers and harder to click.
**Action:** When creating or reviewing modals with forms, strictly check for explicit `htmlFor` and `id` linkage, especially in custom UI components.
