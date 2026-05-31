# Desktop Architecture Migration Tasks

- `[x]` 1. Remove obsolete entry points and unused `DesktopPosApp.jsx`
  - `[x]` Delete `src/main.desktop.jsx`
  - `[x]` Delete `desktop.html` from `public` or wherever it is located
  - `[x]` Delete `src/DesktopPosApp.jsx`
- `[x]` 2. Create `DesktopTerminalShell` component
  - `[x]` Create `src/components/desktop/DesktopTerminalShell.jsx`
- `[x]` 3. Update `App.jsx` to unify routing
  - `[x]` Check `isDesktopMode()`
  - `[x]` Render `<DesktopTerminalShell>` instead of the main web layout if in desktop mode
- `[x]` 4. Update `main.cjs`
  - `[x]` Remove `desktop.html` loading logic
  - `[x]` Ensure it always loads `index.html` in dev and prod
- `[x]` 5. Verify the architecture
  - `[x]` Successfully compiled via `npm run build`
