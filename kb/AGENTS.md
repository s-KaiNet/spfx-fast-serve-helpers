# KB rules

This folder is the project knowledge base of `spfx-fast-serve-helpers` for SPFx 1.23 (the `fast-serve` dev server, built on Rspack; branch `v1.23`, versions `1.23.x`, cut from the v1.24 line). Each SPFx minor has its own branch and package line; this branch is written for SPFx 1.23 only, without version branching in the code. Evidence lines that name `1.24.0-…` versions record checks made on the v1.24 line before the branch was cut. The earlier Vite implementation (branch `vite`, history only) has its own knowledge base on that branch: facts about the Vite version appear here only as lessons or comparisons, clearly labelled. It holds knowledge, not a map of files.

- **Current truth only.** Pages describe how things are now. Rewrite superseded facts instead of keeping history; history lives only as compact entries in [log.md](log.md).
- **Markdown only.** No scripts, generated files, raw source copies or manifests under `kb/`.
- **Level of abstraction.** Describe behavior, responsibilities, contracts and decisions. Never name source or test files, paths, internal symbols, test counts or commit hashes. Public contracts (CLI options, config keys, env vars, user-visible files and URLs, dependency names and versions) may be named exactly.
- **Flexible layout.** Folders mirror real knowledge areas and may be nested when a cluster of pages needs it. Use lowercase hyphenated names.
- **Links.** Use relative Markdown links between KB pages only, never into source code. Every page is listed in [index.md](index.md) and linked from at least one related page.
- **Frontmatter.** Every canonical page starts with:

```yaml
---
title: Page Title
type: architecture | decision | feature | concept | reference | limitation | operation | roadmap
status: current | draft | needs-clarification
tags:
  - project-kb
---
```

followed by `# Title`, `## Summary`, `## Current Knowledge` (or the type-specific sections from the `kb-ingest` skill), `## Links`, and `## Evidence` for non-obvious facts.
