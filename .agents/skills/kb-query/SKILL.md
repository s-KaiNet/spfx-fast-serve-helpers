---
name: kb-query
description: Query the local project KB. Use when the user asks what the project KB knows, wants project context loaded, asks about architecture, decisions, features, concepts, constraints, or requests an answer grounded in the current KB. This skill is read-only.
---

# KB Query

Answer from the current project KB. This skill is read-only.

## Read-Only Rule

Do not create, edit, move, or delete files. If the user provides new information while asking a question, answer the question first and suggest using `kb-ingest` for the update.

## Retrieval Order

1. Read `kb/AGENTS.md` to confirm KB rules.
2. Read `kb/index.md` first for page discovery.
3. After reading `kb/index.md`, read the relevant canonical pages it points to, if any.
4. Read recent `kb/log.md` entries only when recent KB update history helps answer the question.
5. Use search across `kb/**/*.md` if `index.md` and the first relevant pages do not answer the question.
6. Read the smallest set of canonical pages needed.

Prefer canonical pages over root control files:

- Prefer `architecture/`, `decisions/`, `features/`, `concepts/`, and `references/`.
- Use `index.md` for page discovery.
- Use `log.md` only for compact update history, not as canonical project knowledge.

## Query Depth

Choose the smallest mode that can answer the question:

- Quick: read `index.md` only. Use for simple orientation and index-level facts.
- Standard: read `index.md` and the 3-5 most relevant canonical pages. This is the default.
- Deep: scan/search the KB broadly and read every relevant page. Use when the user asks for an audit, comparison, contradiction check, architecture review, or comprehensive answer.

## Query Types

- Factual lookup: find the most specific page and answer from it.
- Architecture lookup: inspect `architecture/` pages and related decisions.
- Decision lookup: inspect `decisions/` pages and explain current rationale.
- Feature lookup: inspect `features/` pages and related architecture or concepts.
- Gap lookup: say clearly when the KB does not contain enough information.

## Answer Rules

- Cite KB pages with normal Markdown links.
- Distinguish KB facts from inference.
- If pages conflict, say they conflict and identify the pages.
- If the KB is silent, say so. Do not invent missing facts.
- If the query reveals outdated or missing KB content, recommend `kb-ingest` or `kb-reconcile` and include a concise potential update.

## Answer Shape

Use this shape unless the user asks for something else:

```markdown
Based on the KB:

<answer>

Pages consulted:
- [Page](kb/path/page.md)

Gaps:
- <missing or unclear knowledge, if any>

Potential KB update:
- Missing page or page to update: <path or title>
- Suggested status: current | draft | needs-clarification
- Clarifying question: <question, if needed>
```

Omit `Gaps` and `Potential KB update` when there are no meaningful gaps.
