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

## 2026-01-16 - Dependency Blindness in Legacy Code

**Learning:**
When refactoring or verifying legacy components (like `HybridEditor`), assume dependencies might be missing from `package.json` if the code was copy-pasted. A passing dev server (Vite) doesn't guarantee a passing production build (TypeScript check).

**Action:**
Before attempting verification:
1. Run `pnpm build` immediately to surface missing type definitions or dependencies.
2. Do not "fix" the environment by adding dependencies unless explicitly authorized; instead, document the missing deps as a blocker or pre-requisite.

## 2026-01-16 - The Ghost Mode Data Gap

**Learning:**
"Ghost Mode" (Auth Bypass) is excellent for UI shell testing but often leaves data-dependent components (like `FileTree`) in an empty/broken state because backend fetchers are bypassed without mock data replacements.

**Action:**
When verifying deep UI components in Ghost Mode:
1. Check if the component has a "preload" prop (like `preloadedTree` in `VaultSidebar`).
2. If mocking data requires modifying source code (`ProjectConfigContext`), consider if the verification value outweighs the risk of polluting the codebase. Often, verifying the *empty state* is sufficient if the *active state* cannot be cleanly mocked without a dedicated mock backend.

## 2026-01-16 - Dead-End Empty States

**Learning:**
Presenting users with generic "Configuration" options during an empty state (like a missing Google Drive connection) creates friction. Users often don't know *which* configuration setting resolves the emptiness.

**Action:**
Empty states must feature a specific, primary Call-to-Action (e.g., "Connect Drive") that directly resolves the missing data. Generic "Settings" buttons should be secondary or tertiary.
