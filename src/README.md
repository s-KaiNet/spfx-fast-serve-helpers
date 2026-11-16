# Source layout

Data flow: **config → project model → generated artifacts → Vite server → browser runtime**
(see [docs/vite/HANDOFF.md §8](../docs/vite/HANDOFF.md)).

Current files:

- `cli.ts`: `fast-serve` bin entry (thin; calls `runCli`).
- `runCli.ts`: argument parsing and command dispatch (testable, no `process` access).
- `packageInfo.ts`: package name/version from `package.json`.

Planned modules (create a folder only when it gets real code):

| Folder | Owns |
|---|---|
| `config/` | options (`port`, `pageUrl`, `locale`), validation, defaults |
| `project/` | SPFx project facts, plain Node, **no Vite imports** (config.json, manifests, package.json, serve.json, locales, SPFx library ids/versions); cached with `invalidate(file)` |
| `manifests/` | debug `manifests.js` |
| `loader/` | AMD shim per bundle + generated ESM entries |
| `externals/` | `sp-*` facades (TLA + CJS variant) |
| `localization/` | `*Strings` modules |
| `styles/` | theme tokens runtime, lib `.module.scss.css`, SCSS typings |
| `transforms/` | `require()` → import, type re-export guard, defines |
| `server/` | HTTPS cert, port, printed/open URL, watch config, warmup |
| `runtime/` | browser code as real TS files (shim template, facade helpers, themed styles) |

Conventions:

- A feature = one module that returns Vite plugin(s), plus its browser runtime and tests.
- Tests live next to the code as `*.test.ts` (vitest); they are excluded from the build.
- Node code is ESM (`NodeNext`): use `.js` extensions in relative imports.
- Browser runtime files must not use Node APIs; they will get their own tsconfig (DOM lib) when the first one is added.
