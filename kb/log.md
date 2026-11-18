# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-18 04:20 | ingest | limitations category populated

- Changed: `kb/limitations/dev-vs-production.md`, `kb/limitations/hmr-gotchas.md`, `kb/limitations/typescript-limits.md`, `kb/limitations/unsupported-scope.md`, `kb/limitations/environment-and-browser-gotchas.md`, `kb/limitations/known-issues.md`, `kb/index.md`, links in concept and feature pages
- Outcome: limitations, gotchas and open issues with causes, workarounds and severity (dev/prod parity and performance, HMR, TypeScript, unsupported scope, environment/browser, known issues); remote/SSH guidance recorded at medium confidence

## 2026-11-18 03:50 | ingest | decisions category populated

- Changed: `kb/decisions/dev-server-only.md`, `kb/decisions/zero-config-cli.md`, `kb/decisions/version-policy.md`, `kb/decisions/development-react.md`, `kb/decisions/on-demand-library-facades.md`, `kb/decisions/unbundled-dev-and-warmup.md`, `kb/decisions/semantic-architecture.md`, `kb/decisions/match-heft-serve-behavior.md`, `kb/decisions/typescript-handling.md`, `kb/decisions/error-reporting.md`, `kb/decisions/scope-cuts.md`, `kb/decisions/toolchain-and-conventions.md`, `kb/index.md`, links in concept, architecture and feature pages
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
