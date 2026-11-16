---
name: kb-reconcile
disable-model-invocation: true
description: Reconcile the local project KB. Use for deduplication, contradictions, stale current facts, orphan pages, broken Markdown links, missing index entries, unclear pages, or general KB cleanup. This skill may edit the KB to keep only current project truth.
---

# KB Reconcile

Reconcile keeps the KB coherent. It removes duplication, resolves contradictions, fixes broken links, and keeps the index aligned with current project truth.

## Boundaries

- Work only under `kb/`.
- Do not create raw source archives, manifests, extra logs, or historical timelines.
- Record compact, newest-first KB maintenance history only in `kb/log.md`.
- Do not add scripts, generated code, services, package dependencies, or non-Markdown automation for KB operation unless the user explicitly asks.
- Keep only current project knowledge.
- Prefer consolidation and rewriting over adding more pages.
- Do not delete ambiguous content outright. If unsure, mark it `Needs clarification`.

## Before Writing

1. Read `kb/AGENTS.md`, `kb/index.md`, and recent `kb/log.md` entries.
2. List all Markdown files under `kb/`, excluding `.gitkeep`.
3. Build a page registry from titles, paths, types, statuses, tags, headings, and index entries.
4. Search exhaustively before declaring something absent.

## Checks

Run these checks:

- Duplicate pages: similar titles, same concept under different names, overlapping summaries.
- Contradictions: two pages make incompatible current claims.
- Stale current facts: a page describes a fact that is no longer current according to other KB pages or the user's provided context.
- Orphan pages: pages not linked from `index.md` or any related page.
- Broken links: Markdown links pointing to missing files.
- Missing index entries: canonical pages absent from `kb/index.md`.
- Empty or weak pages: pages with little current knowledge.
- Frontmatter gaps on canonical content pages: missing `title`, `type`, `status`, or `tags`. Exclude control files such as `kb/AGENTS.md`, `kb/index.md`, and `kb/log.md` from canonical page checks.
- Stale-claim indicators: claims referencing missing project files, modules, commands, or folders; `status: current` pages containing `TBD`, `maybe`, `old`, `previous`, `deprecated`, or unresolved uncertainty.
- Link gaps: important mentions of existing page titles, aliases, or key terms that are not linked.

## Resolution Rules

For duplicate pages:

1. Pick the canonical page by clearer title, richer current content, stronger inbound links, and better folder placement.
2. Merge unique current facts into the canonical page.
3. Update inbound links to point to the canonical page.
4. Remove the duplicate page if its content is fully merged.
5. Update `kb/index.md`.

For contradictions:

1. Prefer the fact that is clearly current using this authority order: explicit current user instruction, current code behavior, current project config or contracts, current canonical docs, existing KB page, inference.
2. Rewrite affected pages to state only the current fact.
3. If the correct current fact is unclear, add `status: needs-clarification` and a short `## Needs Clarification` section.
4. Do not preserve both sides as history unless the user asks.

For orphan pages:

- Link them from `index.md` and a related page if they contain useful current knowledge.
- Merge them into a better page if they are too thin.
- Remove them if they are obsolete and contain no unique current knowledge.

For broken links:

- Fix the relative path when the target exists.
- Replace the link with plain text if no target should exist.
- Create a page only when the missing target is durable current project knowledge.

For stale claims:

- Rewrite the page to current truth when the current fact is clear.
- Remove obsolete claims that no longer describe the project.
- Mark `status: needs-clarification` when the claim might still matter but cannot be verified.
- Update affected canonical pages if they repeat or point to the stale claim.

For link gaps:

- Add relative Markdown links where they improve navigation.
- Avoid linking every repeated mention.
- When a page title is ambiguous, leave plain text or mark the page `needs-clarification`.

## Update `log.md`

After successful reconciliation changes, insert a new entry immediately below the entry-format section in `kb/log.md` so the newest entry appears first.

Use this compact format:

```markdown
## YYYY-MM-DD HH:MM | reconcile | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

Do not include raw source text, transcripts, superseded facts, or long rationale. If no KB files changed, do not add a log entry.

## Final Self-Check

Before responding, verify:

- every changed canonical page has required frontmatter.
- every canonical page is reachable from `kb/index.md`.
- relative Markdown links resolve.
- duplicate pages were either merged, linked intentionally, or reported as remaining risk.
- `needs-clarification` pages contain the exact question to resolve.
- `kb/log.md` has one compact entry for the completed KB change.
- no raw source archive, manifest, extra operation log, generated code, service, or dependency was created unless explicitly requested.

## Final Response

Report:

- duplicates merged
- contradictions resolved
- links fixed
- pages removed or consolidated
- pages marked `needs-clarification`
- remaining risks or questions
