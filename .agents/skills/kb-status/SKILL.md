---
name: kb-status
disable-model-invocation: true
description: Read-only health check for the local project KB. Use to report stale pages, duplicate candidates, broken Markdown links, orphan pages, missing index entries, frontmatter gaps, and unclear contradictions without editing files.
---

# KB Status

Report KB health without modifying files.

## Read-Only Rule

Do not create, edit, move, or delete files.

## Inputs

1. Read `kb/AGENTS.md`.
2. Read `kb/index.md`.
3. Read `kb/log.md`.
4. Enumerate all Markdown files under `kb/`, excluding `.gitkeep`.

## Checks

Report:

- missing required files: `kb/AGENTS.md`, `kb/index.md`, `kb/log.md`
- canonical pages missing from `index.md`
- index entries pointing to missing files
- broken relative Markdown links
- orphan pages not reachable from `index.md`
- duplicate candidates by similar title, same tags, or overlapping summary
- canonical content pages missing frontmatter fields: `title`, `type`, `status`, `tags`. Exclude control files such as `kb/AGENTS.md`, `kb/index.md`, and `kb/log.md` from this check.
- pages with `status: needs-clarification`
- contradictions that are visible from current page contents
- overly historical sections such as `History`, `Previous`, `Superseded`, or `Changelog`
- stale-claim indicators: references to missing project files, modules, commands, or folders; `status: current` pages containing `TBD`, `maybe`, `old`, `previous`, `deprecated`, or unresolved uncertainty
- log issues: missing newest-first compact entry guidance, entries not maintained newest-first, entries containing raw source text/transcripts, or operation-history files outside `kb/log.md`
- link gaps where important mentions of existing page titles, aliases, or key terms are not linked
- missing or weak evidence blocks on pages that record non-obvious facts, research conclusions, implementation-derived knowledge, or inference

## Report Shape

Use this format:

```markdown
## KB Status

- Pages scanned: N
- Issues found: N

## Findings

- [severity] [page](kb/path/page.md): issue and suggested fix.

## Suggested Next Actions

1. ...
```

Severity values:

- `high`: contradiction, broken core link, missing required file, misleading current fact.
- `medium`: duplicate candidate, orphan useful page, missing index entry.
- `low`: weak summary, tag/frontmatter cleanup, wording issue.

If no issues are found, say the KB is healthy and list pages scanned.
