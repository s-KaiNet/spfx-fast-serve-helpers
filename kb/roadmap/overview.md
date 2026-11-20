---
title: Roadmap overview and pending actions
type: roadmap
status: current
tags:
  - project-kb
  - roadmap
  - status
  - release
---

# Roadmap overview and pending actions

## Summary

`spfx-fast-serve-helpers` `1.24.0-beta.4` is feature-complete for its planned scope: web parts, extensions and ACEs of SPFx 1.24.x, with HMR and React Fast Refresh. What remains is one user verification (VS Code F5), the release decision, and a set of researched or deferred items. Nothing is pushed or published until the user decides; every next step starts only after the user agrees to it.

## Current Knowledge

### Status

- All planned phases are done: the web part core (manifests, bundle shim, on-demand SPFx library facades, styles, localization, typings, certificate, options, version check), the follow-up phase (tsconfig `paths`, static-asset typings, `config.json` externals, TypeScript loc files, docs, performance) and the "Next" phase (project-only error forwarding, `const enum`/decorator checks, extensions with `serveConfigurations`, runtime errors in Vite's overlay with the `overlay` option, ACEs, removal of the startup warmup, `config/sass.json` `silenceDeprecations` in Vite's Sass compile, Sass `pkg:` URLs, webpack-like imports from `config.json` externals, hiding Node's HTTP/2 status-message warning, webpack-like bare `require()` in project code and AMD isolation of dependency code with the `amdPackages` opt-out).
- Webpack customization support is done the user's way: the options file moved to `fast-serve/config.json`, the optional `fast-serve/vite.extend.mts` with a minimal public `defineConfig` entry, the startup hint for heft webpack customizations and the shipped `fast-serve-vite-config` agent skill (see [Customizing the Vite config](../features/vite-extend-file.md)). Translating webpack customizations was researched and rejected.
- Live SharePoint debugging is packaged as the `spfx-debugging` agent skill (see [Live verification on a SharePoint tenant](../operations/live-verification.md)).
- Release acceptance was run on a fresh tarball in both test projects on the test tenant and passed; the overlay work was verified live afterwards. The changes since then are covered by unit and integration tests and were each checked live on a copy of the small test project (extend file, externals imports, `require()` rewriting and AMD isolation in SharePoint; Sass `pkg:` against the dev server); a full acceptance run on the current version has not been recorded (see [Local testing and consumer setup](../operations/local-testing-and-consumer-setup.md)).
- Cut by the user: theme-change monitoring and the `@pnp/spfx-property-controls` 3.13 already-hashed CSS case (see [Scope cuts](../decisions/scope-cuts.md)).

### Pending user actions

| Item | Status |
|---|---|
| Verify the documented VS Code `launch.json` with F5 in real VS Code | open; DevTools source maps already work (see [VS Code debugging and remote development](../operations/debugging-and-remote-development.md)) |
| Decide whether to push the work and publish the package | open; nothing is pushed or published |
| Agree the library components design | open; research done, option B recommended (see [Library components](library-components.md)) |
| Decide on SPFx 1.23 support | open; research done, one package for 1.23–1.24 recommended (see [SPFx 1.23 support](spfx-1-23-support.md)) |
| Type checking while serving with tsgo (the native TypeScript compiler), as an optional feature | idea only, discussed but not researched; today type checking is out of scope (see [Dev server only](../decisions/dev-server-only.md)) |

### Next steps (in order, each after the user agrees)

1. VS Code F5 check.
2. Library components: agree the design, then implement option B.
3. Decide on SPFx 1.23 support (about 2–3 days if accepted).
4. Before publishing: rebuild the tarball, re-run the acceptance checklist in both test projects, optionally re-run the benchmark harness against the package (see [Benchmark method](../operations/benchmark-method.md)).

### Deferred

- Skipped: the occasional page-load hang (resume only if it returns).
- Later, not planned now: tunnels (ngrok), Docker/WSL/containers, Teams and other Microsoft 365 hosts, re-mounting web parts instead of reloading the page. Library components and SPFx 1.23 sit on the same "later" list, but are researched and waiting for a decision.
- Details and resume notes: [Deferred work](deferred-work.md).

### Process rules that shape the roadmap

- Discovery and approval before building; ask when scope is unclear.
- Do not commit, push or publish unless the user asks (see [Package toolchain and code conventions](../decisions/toolchain-and-conventions.md)).

## Links

- [SPFx 1.23 support](spfx-1-23-support.md)
- [Library components](library-components.md)
- [Deferred work](deferred-work.md)
- [Unsupported scope](../limitations/unsupported-scope.md)
- [Known issues and fragile points](../limitations/known-issues.md)
- [Version policy](../decisions/version-policy.md)

## Evidence

- Source: project handoff notes (status, open issues, "Later" list, next steps), user instructions
- Confidence: stated
- Last checked: 2026-11-19
