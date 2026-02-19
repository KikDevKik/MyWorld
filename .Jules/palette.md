# Palette's Journal 🎨

## 2024-05-24 - [StatusBar Settings Accessibility]
**Learning:** Popovers and small settings menus often get overlooked in accessibility audits. Without proper focus management (`autoFocus` on input, `Escape` to close), keyboard users get trapped or lost. Even small interactions like changing a daily goal need to follow standard modal/dialog patterns.
**Action:** Always wrap custom popovers with a backdrop for click-outside behavior and ensure focus moves inside the popover immediately upon opening.
