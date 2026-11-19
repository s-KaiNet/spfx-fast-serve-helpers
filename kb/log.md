# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-19 17:40 | ingest | webpack-like bare require(), AMD isolation, amdPackages, beta.2

- Changed: `kb/features/require-and-amd.md` (new), `kb/decisions/amd-isolation-for-dependencies.md` (new), `kb/features/typescript-compatibility.md`, `kb/features/cli-and-options.md`, `kb/features/errors-and-diagnostics.md`, `kb/architecture/source-pipeline.md`, `kb/architecture/overview.md`, `kb/decisions/typescript-handling.md`, `kb/decisions/error-reporting.md`, `kb/decisions/version-policy.md`, `kb/limitations/typescript-limits.md`, `kb/limitations/dev-vs-production.md`, `kb/limitations/known-issues.md`, `kb/references/vite-oxc-rolldown.md`, `kb/operations/development-workflow.md`, `kb/operations/local-testing-and-consumer-setup.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: `require('<literal>')` in project code (incl. packages) now gives webpack's values, computed/special forms left alone, ESM hoisting as the remaining difference (replaces "only relative and alias require"); global `define` hidden from dependency code with `amdPackages` opt-out and an AMD mismatch hint as the one exception to project-frame forwarding; known differences (no `window._`, linked source packages, AMD-only files); Vite 8 CJS namespace copy and optimizer-hash facts; version `1.24.0-beta.2`

## 2026-11-19 15:44 | ingest | fast-serve/ folder, Vite extend file, externals imports, Sass pkg:, beta.1

- Changed: `kb/features/vite-extend-file.md` (new), `kb/decisions/zero-config-cli.md`, `kb/features/cli-and-options.md`, `kb/features/library-imports-and-externals.md`, `kb/features/styles-and-assets.md`, `kb/features/typescript-compatibility.md`, `kb/features/errors-and-diagnostics.md`, `kb/features/hmr-and-fast-refresh.md`, `kb/features/localization.md`, `kb/architecture/overview.md`, `kb/architecture/runtime-flows.md`, `kb/architecture/spfx-libraries-and-externals.md`, `kb/architecture/source-pipeline.md`, `kb/decisions/version-policy.md`, `kb/decisions/match-heft-serve-behavior.md`, `kb/decisions/error-reporting.md`, `kb/decisions/dev-server-only.md`, `kb/decisions/semantic-architecture.md`, `kb/limitations/dev-vs-production.md`, `kb/limitations/unsupported-scope.md`, `kb/limitations/known-issues.md`, `kb/limitations/hmr-gotchas.md`, `kb/concepts/spfx-dev-loop.md`, `kb/concepts/glossary.md`, `kb/operations/live-verification.md`, `kb/operations/local-testing-and-consumer-setup.md`, `kb/operations/development-workflow.md`, `kb/references/spfx-heft-pipeline.md`, `kb/references/vite-oxc-rolldown.md`, `kb/references/dependencies-and-external-docs.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: options file is `fast-serve/config.json` everywhere (old `config/fast-serve.json` only as the warned-about old location); zero-config decision amended with the `fast-serve/vite.extend.mts` escape hatch, minimal `defineConfig` entry, warn-only guard, restarts, webpack-customization hint and shipped agent skill (translation rejected); webpack-like `config.json` external imports replace the old named-import limitation; Sass `pkg:` URLs; hidden HTTP/2 status-message warning; `spfx-debugging` skill and `.env` variables; version `1.24.0-beta.1`; roadmap adds the tsgo type-checking idea; heft customization mechanics and CDN-external CSP recorded as references

## 2026-11-18 22:45 | ingest | open questions resolved, KB made generic

- Changed: `kb/operations/debugging-and-remote-development.md`, `kb/operations/local-testing-and-consumer-setup.md`, `kb/operations/live-verification.md`, `kb/operations/benchmark-method.md`, `kb/decisions/scope-cuts.md`, `kb/features/localization.md`, `kb/limitations/environment-and-browser-gotchas.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: SSH-from-Windows setup marked user-verified; locale switch removed from scope cuts (locale chosen at start, restart to change); local testing installs the version-named packed tarball; machine paths, tenant names and page URLs replaced with generic descriptions; no open clarifications left

## 2026-11-18 06:30 | status+reconcile | final consistency check

- Changed: `kb/decisions/unbundled-dev-without-warmup.md` (renamed from the warmup decision), `kb/decisions/scope-cuts.md`, `kb/architecture/runtime-flows.md`, `kb/architecture/source-pipeline.md`, `kb/architecture/overview.md`, `kb/features/styles-and-assets.md`, `kb/features/hmr-and-fast-refresh.md`, `kb/features/cli-and-options.md`, `kb/limitations/dev-vs-production.md`, `kb/limitations/hmr-gotchas.md`, `kb/limitations/known-issues.md`, `kb/concepts/hmr-and-vite-terms.md`, `kb/concepts/glossary.md`, `kb/references/vite-oxc-rolldown.md`, `kb/references/benchmark-results.md`, `kb/references/dependencies-and-external-docs.md`, `kb/operations/benchmark-method.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: startup warmup removed everywhere (files compile on request, typings when the server listens); `config/sass.json` `silenceDeprecations` now applied to Vite's Sass compile with restart on edit, no longer listed as a scope cut; benchmark script paths removed; duplicated performance and page-load-hang details folded into their canonical pages; structure checks clean (index, links, frontmatter)

## 2026-11-18 05:50 | ingest | references category populated

- Changed: `kb/references/spfx-heft-pipeline.md`, `kb/references/vite-oxc-rolldown.md`, `kb/references/benchmark-results.md`, `kb/references/dependencies-and-external-docs.md`, `kb/index.md`, links in one concept, three decision and one operation page
- Outcome: reverse-engineered heft 1.24 pipeline facts, Vite/Oxc/Rolldown behaviors relied upon, benchmark conclusions, dependency/version facts and external docs

## 2026-11-18 05:20 | ingest | roadmap category populated

- Changed: `kb/roadmap/overview.md`, `kb/roadmap/spfx-1-23-support.md`, `kb/roadmap/library-components.md`, `kb/roadmap/deferred-work.md`, `kb/index.md`, links in three limitation, one decision and one feature page
- Outcome: project status and pending user actions (F5 check, push/publish undecided), SPFx 1.23 support research and recommended plan, library components option B design, deferred items (page-load hang, tunnels, containers, Teams hosts, re-mount idea)

## 2026-11-18 04:50 | ingest | operations category populated

- Changed: `kb/operations/development-workflow.md`, `kb/operations/local-testing-and-consumer-setup.md`, `kb/operations/live-verification.md`, `kb/operations/benchmark-method.md`, `kb/operations/debugging-and-remote-development.md`, `kb/index.md`, links in one decision, two limitation and one feature page
- Outcome: toolchain and conventions, local tarball testing and consumer setup, test projects and acceptance checklist, live tenant verification with agent-browser, benchmark method, VS Code debugging and SSH-from-Windows setup; tarball naming and SSH verification need clarification

## 2026-11-18 04:20 | ingest | limitations category populated

- Changed: `kb/limitations/dev-vs-production.md`, `kb/limitations/hmr-gotchas.md`, `kb/limitations/typescript-limits.md`, `kb/limitations/unsupported-scope.md`, `kb/limitations/environment-and-browser-gotchas.md`, `kb/limitations/known-issues.md`, `kb/index.md`, links in concept and feature pages
- Outcome: limitations, gotchas and open issues with causes, workarounds and severity (dev/prod parity and performance, HMR, TypeScript, unsupported scope, environment/browser, known issues); remote/SSH guidance recorded at medium confidence

## 2026-11-18 03:50 | ingest | decisions category populated

- Changed: `kb/decisions/dev-server-only.md`, `kb/decisions/zero-config-cli.md`, `kb/decisions/version-policy.md`, `kb/decisions/development-react.md`, `kb/decisions/on-demand-library-facades.md`, `kb/decisions/unbundled-dev-without-warmup.md`, `kb/decisions/semantic-architecture.md`, `kb/decisions/match-heft-serve-behavior.md`, `kb/decisions/typescript-handling.md`, `kb/decisions/error-reporting.md`, `kb/decisions/scope-cuts.md`, `kb/decisions/toolchain-and-conventions.md`, `kb/index.md`, links in concept, architecture and feature pages
- Outcome: accepted decisions with context, rationale and consequences (scope, CLI shape, versioning, React, library loading, performance, architecture, heft parity, TypeScript, errors, scope cuts, toolchain); locale-switch cut needs clarification

## 2026-11-18 03:20 | ingest | features category populated

- Changed: `kb/features/cli-and-options.md`, `kb/features/serving-components.md`, `kb/features/hmr-and-fast-refresh.md`, `kb/features/styles-and-assets.md`, `kb/features/typescript-compatibility.md`, `kb/features/localization.md`, `kb/features/library-imports-and-externals.md`, `kb/features/errors-and-diagnostics.md`, `kb/index.md`, links in architecture and concept pages
- Outcome: user-visible behavior of the CLI and options, component serving and serve configurations, HMR, styles and typings, TypeScript compatibility, localization, library imports and externals, errors and diagnostics

## 2026-11-18 02:40 | ingest | architecture category populated

- Changed: `kb/architecture/overview.md`, `kb/architecture/runtime-flows.md`, `kb/architecture/spfx-libraries-and-externals.md`, `kb/architecture/source-pipeline.md`, `kb/index.md`, links in four concept pages
- Outcome: system shape, components and dependency rules, startup/page-load/HMR/failure flows, on-demand SPFx library loading, source pipeline and pre-bundling customization

## 2026-11-18 02:05 | ingest | concepts category populated

- Changed: `kb/concepts/spfx-dev-loop.md`, `kb/concepts/sharepoint-debug-flow.md`, `kb/concepts/component-manifests-and-loader.md`, `kb/concepts/spfx-component-types.md`, `kb/concepts/styles-localization-assets.md`, `kb/concepts/hmr-and-vite-terms.md`, `kb/concepts/glossary.md`, `kb/index.md`
- Outcome: SPFx platform concepts (Heft loop, debug flow, manifests and loader, component types, styles/loc/assets, HMR and Vite terms) and a glossary

## 2026-11-18 | setup | KB initialized

- Changed: `kb/AGENTS.md`, `kb/index.md`, `kb/log.md`, starter folders
- Outcome: empty KB with folders for concepts, architecture, features, decisions, limitations, operations, roadmap and references
