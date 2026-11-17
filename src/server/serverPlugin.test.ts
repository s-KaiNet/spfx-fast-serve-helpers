import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';
import type { UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { toPosix } from '../utils/paths.js';
import { serverPlugin } from './index.js';

const root = fileURLToPath(new URL('../../test/fixtures/basic/', import.meta.url)).replace(/[\\/]$/, '');
const https = { cert: 'test-cert', key: 'test-key' };

function serverConfig(): UserConfig {
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const context: ServeContext = {
    root,
    project: createProject(root, logger),
    logger,
    options: { port: 4400, origin: 'https://localhost:4400', locale: 'en-us', pageUrl: undefined, pageUrlTemplate: undefined },
  };
  return (serverPlugin(context, https).config as () => UserConfig)();
}

function projectFile(relativePath: string): string {
  return `${toPosix(root)}/${relativePath}`;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error(`expected an array, got ${String(value)}`);
  return value.map(String);
}

describe('server plugin config', () => {
  it('listens on localhost with the configured port, origin and certificate', () => {
    const { server, appType } = serverConfig();
    expect(appType).toBe('custom');
    expect(server).toMatchObject({
      host: 'localhost',
      port: 4400,
      strictPort: true,
      origin: 'https://localhost:4400',
      https,
      cors: { origin: true },
      headers: { 'Access-Control-Allow-Private-Network': 'true' },
    });
  });

  it('dedupes React so libraries with their own copy share the project one', () => {
    expect(serverConfig().resolve?.dedupe).toEqual(['react', 'react-dom']);
  });

  it('ignores SPFx build output folders in the watcher but not the sources', () => {
    const isIgnored = picomatch(asStrings(serverConfig().server?.watch?.ignored));

    const outputs = ['lib/index.js', 'dist/bundle.js', 'temp/build/manifests.js', 'release/manifests/a.json', 'sharepoint/solution/a.sppkg', 'teams/icon.png', '.heft/cache.json', 'jest-output/report.xml'];
    const sources = ['src/webparts/hello/HelloWebPart.ts', 'config/config.json', 'package.json'];

    expect(outputs.filter((file) => !isIgnored(projectFile(file)))).toEqual([]);
    expect(sources.filter((file) => isIgnored(projectFile(file)))).toEqual([]);
  });

  it('warms up source scripts without declarations and tests', async () => {
    const patterns = asStrings(serverConfig().server?.warmup?.clientFiles);
    const project = mkdtempSync(path.join(tmpdir(), 'fast-serve-warmup-'));
    try {
      const files = [
        'src/webparts/hello/HelloWebPart.ts',
        'src/webparts/hello/components/Hello.tsx',
        'src/webparts/hello/legacy.js',
        'src/webparts/hello/Widget.jsx',
        'src/webparts/hello/Hello.module.scss',
        'src/types/env.d.ts',
        'src/webparts/hello/Hello.test.tsx',
        'src/webparts/hello/Hello.spec.ts',
        'src/webparts/hello/__tests__/Hello.tsx',
        'lib/webparts/hello/HelloWebPart.js',
      ];
      for (const file of files) {
        mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
        writeFileSync(path.join(project, file), '');
      }
      const warmedUp = await glob(patterns, { cwd: project, expandDirectories: false });
      expect(warmedUp.toSorted()).toEqual([
        'src/webparts/hello/HelloWebPart.ts',
        'src/webparts/hello/Widget.jsx',
        'src/webparts/hello/components/Hello.tsx',
        'src/webparts/hello/legacy.js',
      ]);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('allows serving files from the workspace and this package', () => {
    const allowed = asStrings(serverConfig().server?.fs?.allow).map((folder) => path.resolve(folder));
    expect(allowed.some((folder) => root.startsWith(folder))).toBe(true);
    expect(allowed).toContain(path.resolve(fileURLToPath(new URL('../..', import.meta.url))));
  });
});
