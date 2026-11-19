import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from 'es-module-lexer';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkableRequest, typeOnlyNamesGuardPlugin } from './index.js';
import { formatTypeReexportMessage, locateExportedName } from './message.js';
import { findMetadataTypeImports } from './metadataImports.js';
import { collectRuntimeExports, findValueReexports, removeReexports } from './reexports.js';

beforeAll(async () => {
  await init();
});

function rewrite(code: string, names: string[]): string {
  const missing = findValueReexports(code).filter((reexport) => names.includes(reexport.importedName));
  return removeReexports(code, missing).toString();
}

function runtimeExportNames(code: string | undefined): string[] {
  return [...collectRuntimeExports(code ?? '').names];
}

describe('findValueReexports', () => {
  it('lists re-exported names that are not marked as types', () => {
    const code = [
      "export { IFoo, bar as baz, type IZ } from './types';",
      "export type { IB } from './b';",
      "export * from './star';",
      "export * as ns from './ns';",
      "import { IImp } from './other';",
      'export { IImp };',
    ].join('\n');
    expect(findValueReexports(code).map(({ importedName, exportedName, from }) => [importedName, exportedName, from])).toEqual([
      ['IFoo', 'IFoo', './types'],
      ['bar', 'baz', './types'],
      ['IImp', 'IImp', './other'],
    ]);
  });
});

describe('removeReexports', () => {
  it('removes only the missing names from export lists', () => {
    expect(rewrite('export { value, IFoo, bar as IBar } from "./types";\n', ['IFoo', 'bar'])).toBe('export { value } from "./types";\n');
    expect(rewrite('export { IFoo } from "./types";\n', ['IFoo'])).toBe('export { } from "./types";\n');
  });

  it('removes imported types from both the import and the export', () => {
    const code = 'import Def, { IImp as Local, val } from "./other";\nexport { Local, val };\nexport default Def;\n';
    expect(rewrite(code, ['IImp'])).toBe('import Def, { val } from "./other";\nexport { val };\nexport default Def;\n');
  });

  it('removes imported types referenced by decorator metadata together with re-exported ones from the same import', () => {
    const code = 'import { IA, IB, val } from "./types";\nexport { IA };\nx(typeof IB === "undefined" ? Object : IB);\n';
    const reexports = findValueReexports(code).filter((reexport) => reexport.importedName === 'IA');
    const importedTypes = findMetadataTypeImports(code);
    expect(removeReexports(code, reexports, importedTypes).toString()).toBe('import { val } from "./types";\nexport { };\nx(typeof IB === "undefined" ? Object : IB);\n');
  });
});

describe('collectRuntimeExports', () => {
  it('separates direct export names from export * sources', () => {
    const code = 'export const a = 1;\nexport default 2;\nexport { b } from "/src/b.ts";\nexport * from "/src/c.ts";\n';
    const { names, starSources } = collectRuntimeExports(code);
    expect([...names]).toEqual(['a', 'default', 'b']);
    expect(starSources).toEqual(['/src/c.ts']);
  });
});

describe('checkableRequest', () => {
  it('maps project files to dev server URLs, keeps virtual ids and skips dependencies', () => {
    expect(checkableRequest('/project', '/project/src/types.ts')).toBe('/src/types.ts');
    expect(checkableRequest('/project', '\0spfx-library:@microsoft/sp-core-library')).toBe('\0spfx-library:@microsoft/sp-core-library');
    expect(checkableRequest('/project', '/project/node_modules/dep/index.js')).toBeUndefined();
    expect(checkableRequest('/project', '/elsewhere/index.ts')).toBeUndefined();
  });
});

describe('formatTypeReexportMessage', () => {
  it('points at the name and suggests a type-only re-export', () => {
    const source = "import { a } from './a';\nexport {\n  value,\n  IFoo,\n} from './types';\n";
    expect(locateExportedName(source, 'IFoo')).toEqual({ line: 4, column: 3 });
    expect(formatTypeReexportMessage('/project', '/project/src/index.ts', source, [{ name: 'IFoo', from: './types', target: 'src/types.ts' }])).toBe(
      [
        "TypeScript types are re-exported as values in src/index.ts. Types don't exist at runtime, so these exports would break the module in the browser; fast-serve removed them from the served code.",
        '  src/index.ts:4:3: "IFoo" is not a runtime export of src/types.ts (probably an interface or a type).',
        'Mark them as type-only re-exports, for example:',
        "  export type { IFoo } from './types';",
      ].join('\n'),
    );
  });
});

describe('typeOnlyNamesGuardPlugin in Vite', () => {
  let projectRoot: string | undefined;
  let server: ViteDevServer | undefined;
  let errors: string[] = [];

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    projectRoot = undefined;
    errors = [];
  });

  async function serve(files: Record<string, string>, plugins: Plugin[] = []): Promise<ViteDevServer> {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-reexports-'));
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), content);
    }
    const logger = { info: () => undefined, warn: () => undefined, error: (message: string) => errors.push(message) };
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      plugins: [...plugins, typeOnlyNamesGuardPlugin({ root: projectRoot, logger })],
    });
    return server;
  }

  const types = 'export interface IFoo { a: string }\nexport type TBar = string;\nexport const value = 1;\n';

  it('drops re-exported interfaces, reports file, line, name and fix, and logs to the browser console', async () => {
    const vite = await serve({ 'src/index.ts': "export const x = 1;\nexport { value, IFoo } from './types';\n", 'src/types.ts': types });
    const result = await vite.environments.client.transformRequest('/src/index.ts');

    expect(runtimeExportNames(result?.code)).toEqual(['x', 'value']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/src\/index\.ts:2:17: "IFoo" is not a runtime export of src\/types\.ts[\s\S]*export type \{ IFoo \} from '\.\/types';/);
    expect(result?.code.startsWith(`console.error(${JSON.stringify(`[fast-serve] ${errors[0]}`)});`)).toBe(true);
  });

  it('drops types imported and exported again', async () => {
    const vite = await serve({ 'src/index.ts': "import { TBar } from './types';\nexport { TBar };\nexport const y = 2;\n", 'src/types.ts': types });
    const result = await vite.environments.client.transformRequest('/src/index.ts');
    expect(result?.code).toContain('import { } from "/src/types.ts";\nexport { };\n');
    expect(runtimeExportNames(result?.code)).toEqual(['y']);
    expect(errors[0]).toMatch(/"TBar" is not a runtime export/);
  });

  it('follows export * chains', async () => {
    const vite = await serve({
      'src/index.ts': "export { value } from './barrel';\n",
      'src/broken.ts': "export { IFoo } from './barrel';\n",
      'src/barrel.ts': "export * from './nested';\n",
      'src/nested.ts': "export * from './types';\n",
      'src/types.ts': types,
    });
    await vite.environments.client.transformRequest('/src/index.ts');
    expect(errors).toEqual([]);
    await vite.environments.client.transformRequest('/src/broken.ts');
    expect(errors[0]).toMatch(/"IFoo" is not a runtime export of src\/barrel\.ts/);
  });

  it('accepts type-only re-exports and values', async () => {
    const vite = await serve({
      'src/index.ts': "export type { IFoo } from './types';\nexport { type TBar, value } from './types';\n",
      'src/types.ts': types,
    });
    const result = await vite.environments.client.transformRequest('/src/index.ts');
    expect(result?.code).not.toContain('console.error');
    expect(errors).toEqual([]);
  });

  it('does not deadlock on circular re-exports', async () => {
    const vite = await serve({
      'src/a.ts': "export const a = 1;\nexport { b } from './b';\n",
      'src/b.ts': "export const b = 2;\nexport { a } from './a';\n",
    });
    const client = vite.environments.client;
    await expect(Promise.all([client.transformRequest('/src/a.ts'), client.transformRequest('/src/b.ts')])).resolves.toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('skips targets it cannot see, such as dependencies or unknown export * sources', async () => {
    const vite = await serve({
      'src/index.ts': "export { anything } from 'dep';\nexport { other } from './star';\n",
      'src/star.ts': "export * from 'dep';\n",
      'node_modules/dep/package.json': '{ "name": "dep", "main": "index.js" }',
      'node_modules/dep/index.js': 'module.exports = { anything: 1, other: 2 };\n',
    });
    await vite.environments.client.transformRequest('/src/index.ts');
    expect(errors).toEqual([]);
  });

  it('checks virtual modules by their runtime exports', async () => {
    const virtualLibrary: Plugin = {
      name: 'virtual-library',
      resolveId: (source) => (source === 'sp-lib' ? '\0sp-lib' : null),
      load: (id) => (id === '\0sp-lib' ? 'export const Version = 1;\n' : null),
    };
    const vite = await serve({ 'src/index.ts': "export { Version, IPropertyPaneConfiguration } from 'sp-lib';\n" }, [virtualLibrary]);
    await vite.environments.client.transformRequest('/src/index.ts');
    expect(errors[0]).toMatch(/"IPropertyPaneConfiguration" is not a runtime export of sp-lib/);
  });

  it('never flags names re-exported from config.json external facades, whose exports are only known at runtime', async () => {
    const externalFacade: Plugin = {
      name: 'external-facade',
      resolveId: (source) => (source === 'ejs' ? '\0spfx-external:ejs' : null),
      load: (id) => (id === '\0spfx-external:ejs' ? 'const external = {};\nexport default external;\nexport { external as __spfxExternalModule };\n' : null),
    };
    const vite = await serve(
      { 'src/index.ts': "export { render } from 'ejs';\nexport { compile } from './barrel';\n", 'src/barrel.ts': "export * from 'ejs';\n" },
      [externalFacade],
    );
    const result = await vite.environments.client.transformRequest('/src/index.ts');
    expect(errors).toEqual([]);
    expect(runtimeExportNames(result?.code)).toEqual(['render', 'compile']);
  });
});

describe('findMetadataTypeImports', () => {
  it('lists named imports referenced by emitted decorator metadata', () => {
    const code = [
      'import { Injectable } from "./container";',
      'import { HttpClient, ILogger as Logger, Mode } from "./types";',
      'import Def, { Id } from "./ids";',
      '_decorateMetadata("design:type", typeof Logger === "undefined" ? Object : Logger);',
      '_decorateMetadata("design:paramtypes", [typeof HttpClient === "undefined" ? Object : HttpClient, typeof Id === "undefined" ? Object : Id]);',
    ].join('\n');
    expect(findMetadataTypeImports(code).map(({ importedName, localName, from }) => [importedName, localName, from])).toEqual([
      ['HttpClient', 'HttpClient', './types'],
      ['ILogger', 'Logger', './types'],
      ['Id', 'Id', './ids'],
    ]);
    expect(findMetadataTypeImports('import { a } from "./a";\nconsole.log(typeof a);')).toEqual([]);
  });
});

describe('type-only imports kept by emitDecoratorMetadata', () => {
  const root = fileURLToPath(new URL('../../../test/fixtures/ts-only-names/', import.meta.url)).replace(/[\\/]$/, '');
  let server: ViteDevServer;
  const warnings: string[] = [];
  const errors: string[] = [];

  beforeAll(async () => {
    const logger = { info: () => undefined, warn: (message: string) => warnings.push(message), error: (message: string) => errors.push(message) };
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
      plugins: [typeOnlyNamesGuardPlugin({ root, logger })],
    });
  });

  afterAll(async () => {
    await server.close();
  });

  afterEach(() => {
    warnings.length = 0;
    errors.length = 0;
  });

  it('removes interfaces and type aliases from the import, so their metadata is Object as with tsc, and suggests import type', async () => {
    const result = await server.environments.client.transformRequest('/src/meta/consumer.ts');
    expect(result?.code).toContain('import { HttpClient, Mode } from "/src/meta/types.ts";');
    expect(result?.code).toContain('typeof ILogger === "undefined" ? Object : ILogger');
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('TypeScript types are imported without `type` in src/meta/consumer.ts, and emitDecoratorMetadata references them');
    expect(warnings[0]).toContain('  src/meta/consumer.ts:2:22: "ILogger" is not a runtime export of src/meta/types.ts (probably an interface or a type).');
    expect(warnings[0]).toContain('  src/meta/consumer.ts:2:31: "Id" is not a runtime export of src/meta/types.ts');
    expect(warnings[0]).toContain("  import type { ILogger, Id } from './types';");
    expect(result?.code.startsWith(`console.warn(${JSON.stringify(`[fast-serve] ${warnings[0]}`)});`)).toBe(true);
  });

  it('leaves modules that import types with import type alone', async () => {
    const result = await server.environments.client.transformRequest('/src/meta/consumerTyped.ts');
    expect(result?.code).not.toContain('console.warn');
    expect(warnings).toEqual([]);
  });
});
