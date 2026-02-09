## 2024-05-22 - Missing Skip-to-Content Navigation
**Learning:** The application layout (SentinelShell) lacks a "Skip to Content" link, forcing keyboard users to tab through the entire sidebar before reaching the main editor. This is a critical accessibility blocker for power users and screen readers.
**Action:** Implement a hidden-until-focused anchor link at the top of the DOM that jumps directly to the main content area (`#main-content`), ensuring high z-index to appear above all layers.
