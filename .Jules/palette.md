# Palette's Journal - Critical Learnings

## 2024-05-22 - Accessibility in Custom UI Components

**Learning:**
Custom interactive components (like the `ChaosSlider` in `WorldEnginePanel`) are completely invisible to screen readers and keyboard users if they are built with generic `div`s. While they look great, they create a dead end for accessibility.

**Action:**
When identifying custom UI controls:
1.  Always add the appropriate ARIA role (`role="slider"`).
2.  Provide value context (`aria-valuenow`, `valuemin`, `valuemax`).
3.  Implement `onKeyDown` handlers for standard keyboard interaction (Arrow keys).
4.  Ensure `tabIndex={0}` is present so the element can actually receive focus.

## 2026-01-15 - The Silent Failure Trap

**Learning:**
Async operations (like authentication) that only log errors to the console leave users in a "zombie state" where the UI appears frozen or broken. This is a critical trust breaker.

**Action:**
For every async user interaction:
1. Initialize loading state immediately.
2. Ensure the `catch` block updates a visible UI error state.
3. Always use a `finally` block to reset the loading state, guaranteeing the UI returns to an interactive state regardless of the outcome.
