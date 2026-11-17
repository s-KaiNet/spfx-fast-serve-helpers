# HMR: do's and don'ts

`fast-serve` runs Vite's hot module replacement (HMR) with React Fast Refresh. When you save a file, Vite sends the changed module to the page. If a module "accepts" the update (React components do), only that module runs again and React re-renders with the state kept. If nothing accepts it on the way up the import chain, the page reloads.

## What updates in place

- **Function components** in `.tsx` files that export only components. State (`useState`, `useReducer`) and refs are kept.
- **Styles:** `.module.scss`, `.scss` and `.css` edits are swapped without re-rendering. Theme tokens (`"[theme:themePrimary, default: #0078d4]"`) resolve again for the new styles.
- **New imports**, including new `@microsoft/sp-*` packages and new files.
- **Plain modules used by components** (helpers, constants, `loc/*.js` strings): the component files that import them run again.

## What reloads the page (by design)

- Edits to the **web part class** (`*WebPart.ts`) and to anything only the web part class imports (services, helpers). SharePoint created the web part instance, so it can't be swapped in place.
- Edits to files that export **components and other values** (constants, hooks, helpers). Fast Refresh skips such files, so the update bubbles up to the web part class. Type-only exports (`interface`, `type`) are fine.
- Edits to `config/config.json`, `config/serve.json`, `package.json`, `tsconfig.json` or a web part manifest.
- A **new npm dependency** used for the first time: Vite pre-bundles it and reloads the page once.

## Do

- Keep one component (or several) per file, and nothing else exported at runtime:
  ```tsx
  export interface IHelloProps { name: string }
  export default function Hello({ name }: IHelloProps): JSX.Element {
    return <h2>Hello, {name}</h2>;
  }
  ```
- Move constants, hooks and helpers out of component files:
  ```
  components/Hello.tsx        components only
  components/useGreeting.ts   hooks
  components/constants.ts     values
  ```
- Do setup in `onInit` of the web part, not at module level: icon registration, PnPjs `spfi().using(SPFx(this.context))`, Graph clients, global listeners. Pass the results down with props or React context.
- Prefer function components: Fast Refresh keeps their state. Class components are re-mounted on every update (state lost).
- Name your components (`export default function Hello()`, not an anonymous arrow function): Fast Refresh needs a name to match the old and the new version.

## Don't

- Don't run side effects at module level in files you edit often (`initializeIcons()`, `spfi()` singletons, `window.addEventListener`, timers). They run again on every hot update of that module: icons warn about re-registration, listeners are added twice, singletons are created again.
- Don't keep state in module-level variables (`let cache = ...`): it's reset when the module updates.
- Don't rely on modules being shared, or not shared, between bundles. In dev all bundles share one module graph; in production each bundle has its own copy.
- Don't mix runtime values into component files "just for now": every edit of such a file reloads the page.
- Don't expect the page theme to be watched: switching the site theme while the page is open doesn't recolor theme tokens. Reload the page.

## When something looks stale

- If the update went through but the UI didn't change, the state may come from an `onInit` result or a module-level singleton that didn't run again. Reload the page.
- Hooks order changes (adding or removing a `useState`) re-mount the component: that's Fast Refresh resetting state on purpose.
- If the web part failed to load (for example a syntax error when the page loaded), it shows the error and the page reloads by itself after the next file change. A syntax error during a hot update is reported in the browser console and the `fast-serve` terminal; saving the fixed file applies the update.
