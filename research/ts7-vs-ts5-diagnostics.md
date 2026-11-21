# TS 7 (tsgo) vs TS 5.8 diagnostics on SPFx code (spike, 2026-11-21, stopped early)

Research only. Scripts, raw outputs and diffs are in `/var/tmp/tsdiff-research/` (`proto/`, `results/raw/<project>/`, `results/summary-*.jsonl`, `results/mut-*.json`). The user stopped the work part-way through, so this report covers only the results that already existed at that point.

## Verdict

**fast-serve won't use TS 7 for background type checking. It will run the project's own TypeScript (5.8 with heft) on the project's own tsconfig.** On SPFx 1.22+ heft-rig projects, TS 7 on the generated tsconfig matched TS 5.8 exactly, but on projects with other tsconfigs it reported errors in code that compiles cleanly with TS 5.8. Some of those errors (the forced `esModuleInterop`) can't be switched off in config.

## Method

- Compilers: `typescript@5.8.3` on the project's `tsconfig.json`, i.e. the extends chain/rig exactly as heft uses it. `typescript@7.0.2` and `7.1.0-beta` (the native `tsc`) on a generated tsconfig. All runs used `--noEmit --pretty false --listFiles`.
- **"Naive" generated tsconfig** (the one from the previous spike, generalised for the older rush-stack-compiler rigs): the extends chain flattened. `target es3/es5/unset` → `es2015`. `moduleResolution node/classic/unset` → `bundler`. Options removed in TS 7 dropped (`importsNotUsedAsValues`, `baseUrl` → `"*"` paths, `downlevelIteration`, …). `noUncheckedSideEffectImports: false`. Emit options dropped.
- Samples: `pnp/sp-dev-fx-webparts`, `-extensions`, `-aces` (shallow sparse clones), installed with `npm ci --ignore-scripts --legacy-peer-deps`, falling back to `npm install` when the lock file was out of sync. SCSS module and asset typings were generated from a regex (`temp/sass-ts` for heft projects, `*.module.scss.ts` for gulp ones). Both compilers see the same typings, so this can't create a difference.
- Diff key: file, line, column, code, message. Pairs that differ only in text, position or code are counted as cosmetic.

## Corpus

| | Projects | `.ts/.tsx` files in `src` |
|---|---|---|
| SPFx 1.22–1.24 heft rig (rea copy + 28 samples) | 29 | 929 |
| SPFx 1.20–1.21 gulp / rush-stack-compiler (TS 4.7–5.3 tsconfigs, checked with TS 5.8) | 11 | 279 |
| **Total** | **40** | **1208** |

Not included: 2 samples whose `npm ci` failed with an npm internal error (`react-modern-organization-chart`, `react-application-alert-banner`), and 6 samples whose install was still running when the work stopped. **bench (1006 files), bench-500 (579) and the corp-lib library (4)** were clean in both compilers in an early run, but that run was overwritten before file lists were recorded, so they aren't in the totals. Four samples already have errors in TS 5.8 (missing `@types/react`/`react-dom`, or scss names my regex didn't produce: 389 errors in total). Both compilers reported every one of those identically.

## Results, naive generated tsconfig (TS 7.0.2 and 7.1.0-beta gave identical results)

| Group | Identical | Projects with differences | TS 7 only (false positives) | TS 5.8 only | Cosmetic |
|---|---|---|---|---|---|
| heft rig 1.22+ | 29/29 | 0 | 0 | 0 | 0 |
| gulp-era tsconfigs | 2/11 | 9 | 162 (≈580 per 1000 files) | 0 | 0 |
| **Total** | **31/40** | **9** | **162** (134 per 1000 files) | **0** | **0** |

Note: the thread's draft numbers (24 projects / 780 files / 70 errors) don't match what's on disk. The table above is computed from `results/summary-naive.jsonl`.

### False-positive kinds (all in clean code)

| Cause | Count | Example | Can config avoid it? |
|---|---|---|---|
| `esModuleInterop` is always on in TS 6/7 (`false` is no longer allowed), so calling or constructing a namespace import fails | 119 (TS2349 ×116, TS2351 ×1, 2 cascaded TS7006) in 4 projects | `import * as moment from "moment"; moment(props.startDate)` → `TS2349 This expression is not callable. Type 'typeof moment' has no call signatures.` (react-calendar-feed `DateBox.tsx:12`). Same with `import * as $ from 'jquery'` and `new RSSParser()` | **No.** Only a diagnostic filter or a confirmation by TS 5.8 would remove it. (The SPFx 1.24 rig already sets `esModuleInterop: true`, so rig projects get this error in TS 5.8 too.) |
| `strict` now defaults to true, `useUnknownInCatchVariables` | 19 (TS2339 ×13, TS2345 ×6) | `catch (e) { … e.message }` → `TS2339 Property 'message' does not exist on type 'unknown'` (react-list-search, react-mega-menu, react-carousel, react-calendar) | Yes: `strict: false` when the project doesn't set it |
| `strict` default → `strictFunctionTypes` (DOM and React handler parameter types) | 9 (TS2322/2345/2769) | `nodeList.forEach((node: HTMLElement, index: number) => …)` → `TS2345 … not assignable to parameter of type '(value: ChildNode, …'` (react-form-builder `Helper.ts:93`); a `ChangeEvent` handler passed to Fluent's `FormEvent` `onChange` (react-datatable) | Yes: `strict: false` |
| `strict` default → `noImplicitAny` | 15 (TS7008/7006/7015) | `public _propertyPaneHelper;` → `TS7008 Member implicitly has an 'any' type` (react-script-editor) | Yes: `strict: false` |

TS 5.8-only (false negatives) in the corpus: none. Resolution: `bundler` picks other `.d.ts` files for some packages (e.g. typebox ESM instead of CJS, `ical-generator` `.d.ts` instead of `.d.cts`), and with `target es2015` an implicit `lib` grows. None of this produced a diagnostic difference in this corpus.

### Partial mitigation run (not finished)

On 7 of the 9 differing projects, the generated tsconfig plus `strict: false` (when unset), `types: ["*"]` (when unset) and the TS 5.8 es5 default `lib` (when `lib` is unset) removed every `strict`-default false positive (list-search, form-builder, script-editor and datatable went to 0). Only the `esModuleInterop` ones remained (calendar-feed 46, holidays-calendar 8, carousel 1). Not done: react-calendar, react-mega-menu, the `resolvePackageJsonExports: false` variant, and re-running the full corpus with this config.

## Mutation set (planted errors; TS 7.0.2 = 7.1-beta)

One file per mistake, all added at once, with a diff per file. 59 generic kinds (undefined names, prop typos, wrong/missing/extra JSX props, wrong generic args, null/undefined under strict, wrong named/default imports, enum misuse, class component `this.state`/`setState`/`this.props`/`this` in callbacks, async/Promise mistakes, async `useEffect`, decorators, CSS module and loc string typos, wrong loc module, type-only import used as a value, abstract/override errors, `catch` unknown, unreachable code, es5-only iteration…) plus Fluent UI v8, PnPjs, PnP controls, ACE and Graph cases.

| Project | Mutations | TS 5.8 errors | Identical | Text only | Different code, same place | TS 5.8 only | TS 7 only |
|---|---|---|---|---|---|---|---|
| rea (1.24 rig) | 63 | 61 | 56 | 4 | 1 | 2 | 0 |
| bench (1.24 rig, Fluent/PnPjs/controls) | 69 | 66 | 62 | 4 | 1 | 2 | 0 |

- TS 5.8 only: `for…of` over a `Set` and a spread of `Map.keys()` (TS2802, exists only with `target es5`).
- Code change: `async function f(): string` gives TS1055 ("…in ES5…") in 5.8 and TS1064 in 7.
- Text only: union members in a different order (`stableTypeOrdering`), and TS 7 prints "The last overload gave the following error" instead of listing every overload (TS2769).
- No errors in files that weren't mutated. The mutation runs on react-engage-hub and react-list-search (bindings written) weren't done.

## Not done

- Mitigation configs on the whole corpus, and the hybrid cost estimate (tsgo finds candidates, TS 5.8 confirms them).
- bench, bench-500 and corp-lib in the totals; 8 samples (6 unfinished installs, 2 failed).
- Mutations on a third or fourth project, including a non-strict one.
