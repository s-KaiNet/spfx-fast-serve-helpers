---
title: HMR and Fast Refresh
type: feature
status: current
tags:
  - project-kb
  - hmr
  - react-fast-refresh
  - vite
---

# HMR and Fast Refresh

## Summary

HMR with React Fast Refresh is always on. Saving a file sends the changed module to the page; React components and styles update in place with state kept, while edits that reach the component class SharePoint instantiated (web part, extension or ACE class) reload the page. Project configuration changes reload the page, and a few tsconfig changes restart the dev server. There is no option to turn HMR off.

## Behavior

### Updates in place (state kept)

- Function components in `.tsx` files that export only components (type-only exports are fine). `useState`/`useReducer` state and refs survive.
- `.module.scss`, `.scss` and `.css` edits: styles are swapped without re-rendering; theme tokens resolve again for the new styles.
- Plain modules used by components (helpers, constants, `loc` strings): the importing component files run again.
- New imports, including new files and new `@microsoft/sp-*` packages (even ones the page never loaded), because SPFx libraries load on demand.
- Extension UIs follow the same rules: the React component an Application Customizer renders into a placeholder, the cell component of a Field Customizer (re-renders every cell), the form component of a Form Customizer.

### Full page reload

- Edits to the web part, extension or ACE class, and to anything only that class imports (services, helpers, `onRenderCell` changes). SharePoint created the instance, so it can't be swapped.
- Edits to files that export components **and** other runtime values: Fast Refresh skips them and the update bubbles up to the class.
- Every ACE edit: card views and quick views are classes registered in `onInit`, imported only by the ACE class, and there is no React tree. This includes quick view JSON templates, ACE loc strings and the lazily loaded property pane. On the hosted workbench the unsaved card survives the reload; an open quick view closes.
- `config/config.json`, `config/serve.json`, `package.json`, component manifests, `tsconfig.json` (and files it extends inside the project), local `config.json` external files.
- A new npm dependency used for the first time: Vite pre-bundles it and reloads once.
- The first edit after a page load during which the error overlay opened (Vite's rule).

### Server restart

- A tsconfig change that alters the compiler options applied to the transform (`experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict`, `strictNullChecks`) restarts the dev server; other tsconfig edits (such as `paths`) only invalidate modules and reload.
- A changed serve configuration only changes the printed URL after a manual restart.

### Guidance for project code

- Keep component files component-only; move constants, hooks and helpers to their own files.
- Do setup in `onInit` (icon registration, PnPjs `spfi().using(SPFx(this.context))`, Graph clients, listeners), not at module level: module-level code runs again on every hot update of that module, so icons re-register, listeners double and singletons are recreated. Module-level state (`let cache`) resets.
- Prefer named function components: class components re-mount on every update (state lost; the SPFx Form Customizer template's class component loses unsaved input), and anonymous components can't be matched.
- Render an extension's React root once and keep it in a field (unmount in `onDispose`), never from module level.
- Changing hook order re-mounts the component on purpose.
- Don't rely on modules being shared, or not shared, between bundles.

## Implementation Notes

- Vite's HMR and `@vitejs/plugin-react` provide the mechanics; React and react-dom are the project's development builds. The generated bundle entry accepts any update that reaches it by reloading the page, which is what makes "class edit → reload" work.
- Styles stay in Vite's `<style>` handling, with style insertion routed through the themed-styles runtime, so CSS HMR works and theme tokens re-resolve per update.
- SPFx library facades are not re-evaluated by HMR; project-model files invalidate the affected part of the model before reloading. See [Startup and request flows](../architecture/runtime-flows.md).
- Re-mounting a web part instead of reloading the page is not implemented (roadmap).

## Edge Cases

- An update that went through but shows stale UI usually comes from an `onInit` result or a module-level singleton that didn't re-run: reload.
- The site theme is not watched: switching it while the page is open doesn't recolor theme tokens until a reload.
- A syntax error during a hot update shows in the overlay, browser console and terminal; saving the fix applies the update. A web part that failed to load reloads itself after the next file change (see [Errors and diagnostics](errors-and-diagnostics.md)).
- Command Sets have no UI of their own, so most edits reload; dialog content in a React component file can hot-update while the dialog is open.
- Build output folders (`lib`, `lib-commonjs`, `lib-esm`, `lib-dts`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`) are not watched.

## Links

- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Serving web parts, extensions and ACEs](serving-components.md)
- [Styles, theme tokens and asset typings](styles-and-assets.md)
- [Errors and diagnostics](errors-and-diagnostics.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [HMR gotchas](../limitations/hmr-gotchas.md)

## Evidence

- Source: HMR guide, user docs, ACE and extensions research, project handoff notes, implementation behavior (loader and server components); verified live during acceptance (TSX hot update with state, SCSS swap, class edit → reload, ACE card view edit → reload)
- Confidence: high
- Last checked: 2026-11-18
