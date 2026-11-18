# HMR: do's and don'ts

`fast-serve` runs Vite's hot module replacement (HMR) with React Fast Refresh. When you save a file, Vite sends the changed module to the page. If a module "accepts" the update (React components do), only that module runs again and React re-renders with the state kept. If nothing accepts it on the way up the import chain, the page reloads.

## What updates in place

- **Function components** in `.tsx` files that export only components. State (`useState`, `useReducer`) and refs are kept.
- **Styles:** `.module.scss`, `.scss` and `.css` edits are swapped without re-rendering. Theme tokens (`"[theme:themePrimary, default: #0078d4]"`) resolve again for the new styles.
- **New imports**, including new `@microsoft/sp-*` packages and new files.
- **Plain modules used by components** (helpers, constants, `loc/*.js` strings): the component files that import them run again.

## What reloads the page (by design)

- Edits to the **web part class** (`*WebPart.ts`) or an **extension class** (`*ApplicationCustomizer.ts`, `*CommandSet.ts`, `*FieldCustomizer.ts`, `*FormCustomizer.ts`) or an **Adaptive Card Extension class** (`*AdaptiveCardExtension.ts`, see [below](#adaptive-card-extensions)) and to anything only that class imports (services, helpers). SharePoint created the instance, so it can't be swapped in place.
- Edits to files that export **components and other values** (constants, hooks, helpers). Fast Refresh skips such files, so the update bubbles up to the web part class. Type-only exports (`interface`, `type`) are fine.
- Edits to `config/config.json`, `config/serve.json`, `package.json`, `tsconfig.json` or a component manifest. A changed `serve.json` serve configuration only changes the printed URL after a restart of `fast-serve`.
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

## Extensions

Extensions follow the same rules: React components they render update in place, the extension class reloads the page.

- **Application Customizer:** render a React component into the placeholder (`this.context.placeholderProvider.tryCreateContent(PlaceholderName.Top)`) once, with `createRoot(placeholder.domElement)`. Edits to that component and its styles update in place, with state kept. Keep the root in a field and unmount it in `onDispose`.
- **Field Customizer:** `onRenderCell` creates one React root per cell. Edits to the cell component re-render every cell in place. Edits to the customizer class reload the page; so do `onRenderCell` changes.
- **Form Customizer:** the form component updates in place. The SPFx template's form component is a class component, so it is re-mounted on every edit: unsaved form input is lost. Use a function component to keep it.
- **ListView Command Set:** a command set has no UI of its own (commands come from the manifest, dialogs from `@microsoft/sp-dialog`), so most edits are to the class and reload the page. Put dialog content in a React component file to edit it in place while the dialog is open.
- Don't render from module level or keep the React root in a module variable: a hot update would run it again and render a second copy.
- Commands (`items` in the command set manifest) and the serve configuration's `properties` are read when the page loads: edit them, then reload (a manifest edit reloads by itself).
- In dev all bundles share one module graph, so an extension and a web part that import the same module share one instance; in production each bundle has its own copy.

## Adaptive Card Extensions

An ACE has no React tree to refresh: SharePoint renders its card and quick views from what the ACE class and its views return. The views are classes registered in `onInit` (`this.cardNavigator.register(...)`, `this.quickViewNavigator.register(...)`), and their modules are only imported by the ACE class, so every edit reloads the page:

- card view (`cardViewParameters`, `onCardSelection`) and quick view (`data`, `template`, `onAction`) classes;
- quick view JSON templates (`template/QuickViewTemplate.json`) and loc strings;
- the ACE class itself, and the property pane class it loads lazily.

After the reload the card shows the change. On the SharePoint Online workbench the unsaved card stays on the canvas across reloads; a quick view that was open closes, so open it again (in Preview mode). Images imported in a view (`import logo from '../assets/logo.png'`) are served from `src`, and manifest icons with a relative path (`"iconImageUrl": "./assets/icon.png"` in `preconfiguredEntries`) too.

## When something looks stale

- If the update went through but the UI didn't change, the state may come from an `onInit` result or a module-level singleton that didn't run again. Reload the page.
- Hooks order changes (adding or removing a `useState`) re-mount the component: that's Fast Refresh resetting state on purpose.
- If the web part failed to load (for example a syntax error when the page loaded), it shows the error and the page reloads by itself after the next file change. A syntax error during a hot update shows in Vite's error overlay, the browser console and the `fast-serve` terminal; saving the fixed file applies the update.
- A runtime error from your code (for example a component that throws while rendering) shows in the error overlay; saving the fix hot-updates the component and clears the overlay. If the error happened while the page loaded, the first edit reloads the page instead.
