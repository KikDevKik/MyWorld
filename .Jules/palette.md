# Palette's Journal 🎨

## 2024-05-24 - [StatusBar Settings Accessibility]
**Learning:** Popovers and small settings menus often get overlooked in accessibility audits. Without proper focus management (`autoFocus` on input, `Escape` to close), keyboard users get trapped or lost. Even small interactions like changing a daily goal need to follow standard modal/dialog patterns.
**Action:** Always wrap custom popovers with a backdrop for click-outside behavior and ensure focus moves inside the popover immediately upon opening.

## 2025-02-09 - [Focus Restoration in Popovers]
**Learning:** Closing a custom popover/modal without restoring focus to the trigger element (e.g., the Settings button) disorients keyboard users, forcing them to re-navigate from the start of the document or an unpredictable location.
**Action:** Use a `ref` on the trigger button and a `useEffect` to programmatically call `.focus()` on it when the popover state changes from open to closed.

## 2026-02-22 - [Visibility of Interactive Elements in Zen Mode]
**Learning:** Elements that are visually hidden in specific modes (like Zen Mode opacity:0) but remain in the DOM must ensure they become visible when they receive keyboard focus. Otherwise, keyboard users are navigating blindly through invisible controls.
**Action:** Use `focus-within:opacity-100` alongside hover states to ensure container visibility when child elements are focused.

## 2025-05-19 - [Modal Dismissal Standardization]
**Learning:** Custom modals like `CrystallizeModal` often lack standard dismissal behaviors (Escape key, backdrop click), leading to user frustration and accessibility barriers. Ensuring a consistent dismissal pattern across all modals is essential for a predictable UX.
**Action:** Implement a standard `useEffect` for the `Escape` key and a backdrop `onClick` handler in all custom modal components.

## 2026-05-25 - [Accessibility of Complex Canvas Controls]
**Learning:** Highly visual components like `NexusCanvas` often rely on icon-only floating controls for Zoom and Tools. These are critical for navigation but completely inaccessible to screen readers without explicit `aria-label` attributes, as `title` is often insufficient or ignored.
**Action:** Systematically audit all floating controls on canvas/map surfaces and enforce `aria-label` for every icon-only button, ensuring the description conveys the action (e.g., "Zoom In") rather than just the icon name.
