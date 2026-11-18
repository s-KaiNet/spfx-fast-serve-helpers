import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { stylesPlugin } from './index.js';
import { createNodePackageImporter, sassPreprocessorOptions } from './sassOptions.js';

describe('sassPreprocessorOptions', () => {
  const importer = { findFileUrl: () => null };

  it('adds the Node package importer next to silenceDeprecations', () => {
    expect(sassPreprocessorOptions({ silenceDeprecations: ['import'] }, importer)).toEqual({
      scss: { silenceDeprecations: ['import'], importers: [importer] },
      sass: { silenceDeprecations: ['import'], importers: [importer] },
    });
  });

  it('sets importers only when an importer is given', () => {
    expect(sassPreprocessorOptions({ silenceDeprecations: ['import'] })).toEqual({
      scss: { silenceDeprecations: ['import'] },
      sass: { silenceDeprecations: ['import'] },
    });
    expect(sassPreprocessorOptions({}, importer)).toEqual({ scss: { importers: [importer] }, sass: { importers: [importer] } });
    expect(sassPreprocessorOptions({})).toBeUndefined();
  });
});

describe('Sass pkg: URLs in Vite', () => {
  let projectRoot = '';
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    projectRoot = '';
  });

  function write(file: string, content: unknown): void {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), typeof content === 'string' ? content : JSON.stringify(content));
  }

  async function serve(files: Record<string, unknown>): Promise<ViteDevServer> {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-sass-pkg-'));
    for (const [file, content] of Object.entries(files)) write(file, content);
    const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
    const context: ServeContext = { root: projectRoot, project: createProject(projectRoot, silent), options: {} as ServeContext['options'], logger: silent };
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null, origin: 'https://localhost:4400' },
      optimizeDeps: { noDiscovery: true },
      plugins: [stylesPlugin(context)],
    });
    return server;
  }

  it('creates an importer from the Sass package Vite loads', () => {
    expect(createNodePackageImporter(tmpdir())?.constructor.name).toBe('NodePackageImporter');
  });

  it('compiles @import, @use and @forward with pkg: URLs, nested pkg: imports in packages and ~ imports', async () => {
    await serve({
      'package.json': { name: 'sass-pkg-project', version: '1.0.0' },
      'node_modules/pkg-fixture/package.json': { name: 'pkg-fixture', version: '1.0.0' },
      'node_modules/pkg-fixture/_vars.scss': "@import 'pkg:nested-fixture/colors';\n$fixture-padding: 12px;\n",
      'node_modules/pkg-fixture/node_modules/nested-fixture/package.json': { name: 'nested-fixture', version: '1.0.0' },
      'node_modules/pkg-fixture/node_modules/nested-fixture/_colors.scss': '$nested-color: #a4262c;\n',
      'node_modules/used-fixture/package.json': { name: 'used-fixture', version: '1.0.0', sass: 'styles/index.scss' },
      'node_modules/used-fixture/styles/index.scss': '$used-color: #107c10;\n',
      'node_modules/forward-fixture/package.json': { name: 'forward-fixture', version: '1.0.0' },
      'node_modules/forward-fixture/_tokens.scss': '.forwarded { color: #5c2d91; }\n',
      'node_modules/tilde-fixture/package.json': { name: 'tilde-fixture', version: '1.0.0' },
      'node_modules/tilde-fixture/_tilde.scss': '$tilde-color: #ffb900;\n',
      'src/Hello.module.scss': [
        "@use 'pkg:used-fixture' as used;",
        "@forward 'pkg:forward-fixture/tokens';",
        "@import 'pkg:pkg-fixture/vars';",
        "@import '~tilde-fixture/tilde';",
        '.title { color: $nested-color; background: used.$used-color; border-color: $tilde-color; padding: $fixture-padding; }',
      ].join('\n'),
    });

    const result = await server?.transformRequest('/src/Hello.module.scss');

    expect(result?.code).toContain('#5c2d91');
    expect(result?.code).toContain('color: #a4262c');
    expect(result?.code).toContain('background: #107c10');
    expect(result?.code).toContain('border-color: #ffb900');
    expect(result?.code).toContain('padding: 12px');
  });
});
