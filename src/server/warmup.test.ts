import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { createStartupWarmup, warmModuleGraph } from './warmup.js';

const FILES: Record<string, string> = {
  'src/entry.ts': "import { a } from './a';\nexport const entry = () => import('./lazy').then(() => a);",
  'src/a.ts': "import { b } from './b';\nexport const a = b;",
  'src/b.ts': "import { a } from './a';\nexport const b = 1;\nexport const cycle = () => a;",
  'src/lazy.ts': 'export const lazy = 1;',
  'src/unused.ts': 'export const unused = 1;',
};

function transformed(devServer: ViteDevServer): string[] {
  return [...devServer.environments.client.moduleGraph.urlToModuleMap.entries()]
    .filter(([, module]) => module.transformResult)
    .map(([url]) => url)
    .toSorted();
}

describe('startup warmup', () => {
  let projectRoot = '';
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    projectRoot = '';
  });

  async function serve(): Promise<ViteDevServer> {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-warmup-'));
    for (const [file, content] of Object.entries(FILES)) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), content);
    }
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null, preTransformRequests: false },
      optimizeDeps: { noDiscovery: true },
    });
    return server;
  }

  it('transforms the static and dynamic import graph of the entries, and nothing else', async () => {
    const devServer = await serve();
    const count = await warmModuleGraph(devServer.environments.client, ['/src/entry.ts']);

    expect(transformed(devServer)).toEqual(['/src/a.ts', '/src/b.ts', '/src/entry.ts', '/src/lazy.ts']);
    expect(count).toBe(4);
  });

  it('marks the startup warmup done after the graph is warm', async () => {
    const devServer = await serve();
    const warmup = createStartupWarmup();
    let doneBeforeRun = false;
    void warmup.done.then(() => {
      doneBeforeRun = transformed(devServer).length === 0;
    });

    await warmup.run(devServer.environments.client, ['/src/entry.ts']);
    await warmup.done;

    expect(doneBeforeRun).toBe(false);
    expect(transformed(devServer)).toContain('/src/lazy.ts');
  });
});
