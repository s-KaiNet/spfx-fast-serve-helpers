import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { tsconfigPathsPlugin } from './index.js';

const SPFX_RIG_TSCONFIG = {
  compilerOptions: { jsx: 'react', rootDir: '../../../../../src' },
  include: ['../../../../../src/**/*.ts', '../../../../../src/**/*.tsx'],
};

describe('tsconfigPathsPlugin in Vite', () => {
  let projectRoot = '';
  let server: ViteDevServer | undefined;
  let context: ServeContext | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    context = undefined;
    projectRoot = '';
  });

  function write(file: string, content: unknown): void {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), typeof content === 'string' ? content : JSON.stringify(content));
  }

  async function serve(files: Record<string, unknown>): Promise<ViteDevServer> {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-paths-'));
    for (const [file, content] of Object.entries(files)) write(file, content);
    const project = createProject(projectRoot, { warn: () => undefined });
    context = { root: projectRoot, project, options: {} as ServeContext['options'], logger: { info: () => undefined, warn: () => undefined, error: () => undefined } };
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null, origin: 'https://localhost:4400' },
      optimizeDeps: { noDiscovery: true },
      plugins: [tsconfigPathsPlugin(context)],
    });
    return server;
  }

  const resolve = async (specifier: string, importer = 'src/webparts/hello/Hello.tsx') =>
    (await server?.environments.client.pluginContainer.resolveId(specifier, path.join(projectRoot, importer)))?.id;
  const relative = (id: string | undefined) => (id === undefined ? undefined : path.relative(projectRoot, id));

  it('resolves aliases from a tsconfig that extends the SPFx build rig', async () => {
    await serve({
      'node_modules/@microsoft/spfx-web-build-rig/profiles/default/tsconfig-base.json': SPFX_RIG_TSCONFIG,
      'tsconfig.json': '{\n  "extends": "./node_modules/@microsoft/spfx-web-build-rig/profiles/default/tsconfig-base.json",\n  // aliases\n  "compilerOptions": { "paths": { "@components/*": ["./src/components/*"], "@multi/*": ["./src/missing/*", "./src/shared/*"] } }\n}',
      'src/webparts/hello/Hello.tsx': 'export {};',
      'src/components/Button.tsx': 'export const Button = 1;',
      'src/components/list/index.ts': 'export const List = 1;',
      'src/shared/Thing.ts': 'export const Thing = 1;',
    });
    expect(relative(await resolve('@components/Button'))).toBe('src/components/Button.tsx');
    expect(relative(await resolve('@components/list'))).toBe('src/components/list/index.ts');
    expect(relative(await resolve('@multi/Thing'))).toBe('src/shared/Thing.ts');
    expect(await resolve('@components/Missing')).toBeUndefined();
  });

  it('resolves through baseUrl only, falls back to packages and leaves node_modules importers alone', async () => {
    await serve({
      'tsconfig.json': { compilerOptions: { baseUrl: './src' } },
      'src/webparts/hello/Hello.tsx': 'export {};',
      'src/services/Data.ts': 'export const data = 1;',
      'node_modules/services/Data.js': 'module.exports = 1;',
      'node_modules/services/package.json': { name: 'services', main: 'Data.js' },
      'node_modules/dep/package.json': { name: 'dep', main: 'index.js' },
      'node_modules/dep/index.js': "require('services/Data');",
      'node_modules/react/package.json': { name: 'react', main: 'index.js' },
      'node_modules/react/index.js': 'module.exports = {};',
    });
    expect(relative(await resolve('services/Data'))).toBe('src/services/Data.ts');
    expect(relative(await resolve('react'))).toBe('node_modules/react/index.js');
    expect(relative(await resolve('services/Data', 'node_modules/dep/index.js'))).toBe('node_modules/services/Data.js');
  });

  it('serves aliased assets as absolute URLs on the dev server origin', async () => {
    const vite = await serve({
      'tsconfig.json': { compilerOptions: { paths: { '@assets/*': ['./src/assets/*'] } } },
      'src/webparts/hello/Hello.tsx': "import logo from '@assets/logo.png';\nimport raw from '@assets/logo.png?url';\nexport const view = [logo, raw];\n",
      'src/assets/logo.png': 'png',
    });
    const hello = await vite.environments.client.transformRequest('/src/webparts/hello/Hello.tsx');
    expect(hello?.code).toMatch(/from "\/src\/assets\/logo\.png\?import"/);
    expect(hello?.code).toMatch(/from "\/src\/assets\/logo\.png\?(import&)?url"/);
    const asset = await vite.environments.client.transformRequest('/src/assets/logo.png?import');
    expect(asset?.code).toBe('export default "https://localhost:4400/src/assets/logo.png"');
  });

  it('picks up tsconfig changes after the project model is invalidated', async () => {
    await serve({
      'tsconfig.json': { compilerOptions: { paths: { '@c/*': ['./src/old/*'] } } },
      'src/webparts/hello/Hello.tsx': 'export {};',
      'src/old/A.ts': 'export {};',
      'src/new/A.ts': 'export {};',
    });
    expect(relative(await resolve('@c/A'))).toBe('src/old/A.ts');
    write('tsconfig.json', { compilerOptions: { paths: { '@c/*': ['./src/new/*'] } } });
    expect(context?.project.invalidate(path.join(projectRoot, 'tsconfig.json'))).toBe('tsconfig');
    expect(relative(await resolve('@c/A'))).toBe('src/new/A.ts');
  });
});
