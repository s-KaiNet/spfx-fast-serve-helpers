# Vite dev server for SPFx: research and handoff

Start with [HANDOFF.md](HANDOFF.md). It covers the goals, user decisions, current P0/P1 list, problems and solutions, and how to debug live.

- [research/spfx-pipeline](research/spfx-pipeline/index.md): how SPFx 1.24 builds, serves and loads components
- [research/vite-serve-plan](research/vite-serve-plan/README.md): parity list, architecture, gotchas, future improvements
- [research/tla-externals](research/tla-externals/README.md): on-demand `sp-*` facades (decided design)
- [research/benchmark](research/benchmark/README.md): Vite vs `heft start` at 250/1000 modules
- [research/pnp-scss](research/pnp-scss/README.md): fix for libraries shipping `.module.scss.css`
- [poc](poc/plugin/README.md): the working PoC plugin
