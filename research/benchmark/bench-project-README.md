# spfx-bench

Synthetic large SPFx 1.24.1 solution, used to benchmark `heft start` against the unbundled Vite dev server
(the PoC plugin from `../spfx-rea/tools/vite-plugin-spfx-serve`). Report: `../spfx-rea/research/benchmark/README.md`.

- `node tools/generate.mjs --modules 1000 [--barrels off]`: regenerates `src/gen` and `bench-targets.json`.
- `npm run serve`: Vite on https://localhost:4341. `npx heft start --nobrowser`: heft on the same port. Run one at a time.
- Benchmarks: `tools/bench/*.mjs`. Results: `results/*.json`.
