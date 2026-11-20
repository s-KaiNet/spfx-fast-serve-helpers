# Agent instructions

- Never create code comments (no `//`, `/* */`, JSDoc) in code you write. Make code self-explanatory through naming and structure instead.
- Use pnpm for dependencies.
- Project context: `research/HANDOFF.md`.
- Live debugging in SharePoint: use the `spfx-debugging` skill; config in `.env`.
- Tests share worker processes (`isolate: false` in `vitest.config.ts`): restore every global, stub, timer, server and watcher a test file touches (e.g. `vi.unstubAllGlobals()` in `afterEach`). `vi.mock` needs isolation; put such a file in a separate isolated Vitest project instead of turning isolation off globally.
