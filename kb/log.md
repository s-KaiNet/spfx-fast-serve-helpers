# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-19 20:30 | setup | fresh KB for the Rspack implementation

- Changed: `kb/AGENTS.md`, `kb/index.md`, `kb/log.md`, `kb/concepts/sharepoint-debug-flow.md`, `kb/concepts/component-manifests-and-loader.md`, `kb/concepts/spfx-component-types.md`, `kb/concepts/externals-semantics.md` (new), `kb/references/spfx-heft-pipeline.md`, `kb/references/rspack.md` (new), `kb/architecture/overview.md` (new), `kb/decisions/rspack-with-own-config.md` (new), `kb/roadmap/overview.md` (new)
- Outcome: the Vite implementation's KB replaced by a separate KB; bundler-independent concepts and the heft pipeline reference carried over and reworded where the bundler matters; heft's bundle format corrected to an anonymous AMD module (checked against heft's config and production output); new pages for the own-config decision, target architecture, roadmap phases, externals semantics and Rspack facts
