# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-19 22:00 | ingest | Rspack compile (R3)

- Changed: `kb/features/rspack-compile.md` (new), `kb/features/cli-and-options.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/references/rspack.md`, `kb/references/spfx-heft-pipeline.md`, `kb/index.md`
- Outcome: own Rspack config documented (contributions, AMD output, virtual entries, externals, React alias, SWC defaults, initial loc/assets/styles/defines); Rspack 2 needs `amd: {}` for AMD parsing; async-chunk externals hoisted by Rspack; heft's first-bundle named `define` quirk and async-loader dependency recorded; structure comparison with heft and compile times added

## 2026-11-19 21:00 | ingest | CLI and options, project model (R1, R2)

- Changed: `kb/features/cli-and-options.md` (new), `kb/architecture/project-model.md` (new), `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: CLI options, precedence, startup order, failures and the interim "not implemented" exit documented; project model facts, invalidation and the snapshot check against heft recorded; `amdPackages` ignored with a warning; `@microsoft/microsoft-graph-client` in the model as heft's library without a manifest, React family deliberately not

## 2026-11-19 20:30 | setup | fresh KB for the Rspack implementation

- Changed: `kb/AGENTS.md`, `kb/index.md`, `kb/log.md`, `kb/concepts/sharepoint-debug-flow.md`, `kb/concepts/component-manifests-and-loader.md`, `kb/concepts/spfx-component-types.md`, `kb/concepts/externals-semantics.md` (new), `kb/references/spfx-heft-pipeline.md`, `kb/references/rspack.md` (new), `kb/architecture/overview.md` (new), `kb/decisions/rspack-with-own-config.md` (new), `kb/roadmap/overview.md` (new)
- Outcome: the Vite implementation's KB replaced by a separate KB; bundler-independent concepts and the heft pipeline reference carried over and reworded where the bundler matters; heft's bundle format corrected to an anonymous AMD module (checked against heft's config and production output); new pages for the own-config decision, target architecture, roadmap phases, externals semantics and Rspack facts
