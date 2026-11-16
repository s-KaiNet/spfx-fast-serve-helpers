# spfx-fast-serve-helpers

> **Work in progress.** Vite-based rewrite for SharePoint Framework **1.24.x** (Heft) projects.

A dev-server-only replacement for `heft start`: fast start, true HMR with React Fast Refresh, and your web part runs inside a real SharePoint page. Production builds and packaging stay on Heft (`heft build` / `heft package-solution`).

Version follows the supported SPFx version (`1.24.x` → SPFx `>=1.24.0 <1.25.0`).

Design notes, decisions and status: [docs/vite/HANDOFF.md](docs/vite/HANDOFF.md).

## Development

```sh
pnpm install
pnpm build      # compile to lib/
pnpm dev        # watch build
pnpm lint
pnpm typecheck
pnpm test
```

## License

MIT
