import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServeContext } from '../../context.js';
import { createProject, type SpfxProject } from '../../project/index.js';
import { oxcTsconfigOptions, transformCompilerOptions, tsconfigTransformChanged, tsconfigTransformPlugin } from './index.js';

const root = fileURLToPath(new URL('../../../test/fixtures/decorators/', import.meta.url)).replace(/[\\/]$/, '');
const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

const TSC_RESULT = {
  tag: 'T1',
  sum: 5,
  titleOwn: false,
  untouchedOwn: false,
  derivedDeclared: 'from-base',
  derivedLabel: 'from-base',
  log: ['prop:title', 'prop:untouched', 'param:run:0:arg', 'param:undefined:1:cfg', 'param:undefined:0:http', 'call:add', 'set:title=initial', 'set:title=changed'],
};

describe('transformCompilerOptions', () => {
  it('keeps only the options that change how Oxc emits classes and decorators', () => {
    expect(
      transformCompilerOptions({
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
        target: 'es5',
        strict: true,
        strictNullChecks: false,
        jsx: 'react',
        importsNotUsedAsValues: 'remove',
        preserveValueImports: true,
        verbatimModuleSyntax: false,
        paths: { '@x/*': ['src/*'] },
      }),
    ).toEqual({ experimentalDecorators: true, emitDecoratorMetadata: true, useDefineForClassFields: false, target: 'es5', strict: true, strictNullChecks: false });
  });

  it('drops values of the wrong type', () => {
    expect(transformCompilerOptions({ experimentalDecorators: 'true', target: 5, strict: 1 })).toEqual({});
  });

  it('reads the SPFx rig options through extends', () => {
    expect(oxcTsconfigOptions(createProject(root, silentLogger))).toEqual({
      tsconfig: { compilerOptions: { experimentalDecorators: true, strict: true, target: 'es5' } },
    });
  });

  it('still passes an inline tsconfig without a tsconfig.json, so Oxc never looks one up', () => {
    const project = { tsconfigCompilerOptions: () => ({}) } as unknown as SpfxProject;
    expect(oxcTsconfigOptions(project)).toEqual({ tsconfig: { compilerOptions: {} } });
  });
});

describe('tsconfig transform in Vite', () => {
  let server: ViteDevServer;
  let project: SpfxProject;
  const cacheDir = mkdtempSync(path.join(tmpdir(), 'fast-serve-tsconfig-'));

  beforeAll(async () => {
    project = createProject(root, silentLogger);
    const context: ServeContext = { root, project, options: {} as ServeContext['options'], logger: silentLogger };
    server = await createServer({
      root,
      configFile: false,
      cacheDir,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [tsconfigTransformPlugin(context), react()],
    });
  });

  afterAll(async () => {
    await server.close();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  const clientCode = async (url: string) => (await server.transformRequest(url))?.code ?? '';

  it('merges the tsconfig options with the React plugin JSX options', () => {
    expect(server.config.oxc).toMatchObject({
      jsx: { runtime: 'automatic' },
      tsconfig: { compilerOptions: { experimentalDecorators: true, strict: true, target: 'es5' } },
    });
  });

  it('transforms legacy decorators and class fields so they behave like tsc', async () => {
    const cases = (await server.ssrLoadModule('/src/cases.ts')) as { runAll: () => unknown };
    expect(cases.runAll()).toEqual(TSC_RESULT);
  });

  it('serves no decorator syntax and no fields without initializers', async () => {
    const code = await clientCode('/src/cases.ts');
    expect(code).not.toMatch(/@(?:tagged|traced|observed|inject)\b/);
    expect(code).not.toMatch(/^\s*(?:declared|label|untouched);/m);
    expect(code).toMatch(/oxc-project\+runtime@[^/]+\/helpers\/esm\/decorate\.js/);
  });

  it('removes type-only imports written without "type" (the rig importsNotUsedAsValues is never applied)', async () => {
    const code = await clientCode('/src/greeter.ts');
    expect(code).not.toContain('types');
    expect(code).toContain('export function greet');
  });

  it('keeps the JSX runtime and Fast Refresh in TSX files', async () => {
    const code = await clientCode('/src/Counter.tsx');
    expect(code).toContain('jsxDEV');
    expect(code).toContain('$RefreshReg$');
    expect(code).not.toContain('/src/types.ts');
  });

  it('detects when the tsconfig asks for different transform options', () => {
    expect(tsconfigTransformChanged(server, project)).toBe(false);
    const withMetadata: SpfxProject = { ...project, tsconfigCompilerOptions: () => ({ ...project.tsconfigCompilerOptions(), emitDecoratorMetadata: true }) };
    expect(tsconfigTransformChanged(server, withMetadata)).toBe(true);
  });
});
