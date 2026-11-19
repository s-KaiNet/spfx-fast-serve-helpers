import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { externalImportsPlugin, rewriteExternalImports } from './externalImports.js';
import { renderExternalEsmFacade } from './facade.js';

const externals = new Set(['ejs', 'apexcharts', '@scope/csp']);
const isConfigExternal = (name: string) => externals.has(name);

function rewrite(code: string): string | undefined {
  return rewriteExternalImports(code, '/p/src/a.js', isConfigExternal)?.code;
}

function rewriteTypeScript(code: string): string | undefined {
  return rewriteExternalImports(code, '/p/src/a.ts', isConfigExternal, 'ts')?.code;
}

describe('rewriteExternalImports', () => {
  it('turns named imports into property reads on the module object', () => {
    expect(rewrite("import { render, compile as c } from 'ejs';\nrender();")).toBe(
      'import { __spfxExternalModule as __spfxExternal0 } from "ejs"; const render = __spfxExternal0?.["render"], c = __spfxExternal0?.["compile"];\nrender();',
    );
  });

  it('keeps the default import next to named imports', () => {
    expect(rewrite("import ApexCharts, { exec } from 'apexcharts';")).toBe(
      'import { default as ApexCharts, __spfxExternalModule as __spfxExternal0 } from "apexcharts"; const exec = __spfxExternal0?.["exec"];',
    );
    expect(rewrite("import { default as Charts, exec } from 'apexcharts';")).toBe(
      'import { default as Charts, __spfxExternalModule as __spfxExternal0 } from "apexcharts"; const exec = __spfxExternal0?.["exec"];',
    );
  });

  it('binds a namespace import to the raw module object', () => {
    expect(rewrite("import * as ejs from 'ejs';")).toBe('import { __spfxExternalModule as ejs } from "ejs";');
    expect(rewrite("import Charts, * as charts from 'apexcharts';")).toBe('import { default as Charts, __spfxExternalModule as charts } from "apexcharts";');
  });

  it('rewrites named re-exports through local bindings', () => {
    expect(rewrite("export { render as renderTemplate, compile, default as ejs } from 'ejs';")).toBe(
      'import { default as __spfxExternal3, __spfxExternalModule as __spfxExternal0 } from "ejs"; ' +
        'const __spfxExternal1 = __spfxExternal0?.["render"], __spfxExternal2 = __spfxExternal0?.["compile"]; ' +
        'export { __spfxExternal1 as renderTemplate, __spfxExternal2 as compile, __spfxExternal3 as ejs };',
    );
    expect(rewrite("export { render as 'render-template' } from 'ejs';")).toBe(
      'import { __spfxExternalModule as __spfxExternal0 } from "ejs"; const __spfxExternal1 = __spfxExternal0?.["render"]; export { __spfxExternal1 as "render-template" };',
    );
  });

  it('re-exports the module object for export * as', () => {
    expect(rewrite("export * as ejs from 'ejs';")).toBe('export { __spfxExternalModule as ejs } from "ejs";');
  });

  it('leaves export * in place and reports it', () => {
    const rewritten = rewriteExternalImports("export * from 'ejs';", '/p/src/a.js', isConfigExternal);
    expect(rewritten?.code).toBe("export * from 'ejs';");
    expect(rewritten?.starReexports).toEqual(['ejs']);
  });

  it('resolves dynamic imports to a webpack-like namespace of the module', () => {
    expect(rewrite("const ejs = await import('ejs'); import('./local.js'); import(name);")).toBe(
      "const ejs = await import('ejs').then((module) => module.__spfxExternalNamespace); import('./local.js'); import(name);",
    );
  });

  it('leaves default-only and side-effect imports, other packages and relative modules alone', () => {
    expect(rewrite("import ejs from 'ejs';\nimport 'apexcharts';\nexport { default } from 'ejs';")).toBeUndefined();
    expect(rewrite("import { useState } from 'react';\nimport { render } from './ejs';\nexport { x } from 'ejs-lint';")).toBeUndefined();
  });

  it('drops type-only specifiers and declarations', () => {
    expect(rewriteTypeScript("import type { Options } from 'ejs';\nexport type { Data } from 'ejs';")).toBeUndefined();
    expect(rewriteTypeScript("import ejs, { type Options, render } from 'ejs';")).toBe(
      'import { default as ejs, __spfxExternalModule as __spfxExternal0 } from "ejs"; const render = __spfxExternal0?.["render"];',
    );
    expect(rewriteTypeScript("import { type Options } from 'ejs';")).toBe('');
    expect(rewriteTypeScript("export { type Data, render } from 'ejs';")).toBe(
      'import { __spfxExternalModule as __spfxExternal0 } from "ejs"; const __spfxExternal1 = __spfxExternal0?.["render"]; export { __spfxExternal1 as render };',
    );
  });

  it('picks local names that are not used in the module', () => {
    expect(rewrite("import { render } from 'ejs';\nconst __spfxExternal0 = 1, __spfxExternal1 = 2;")).toBe(
      'import { __spfxExternalModule as __spfxExternal2 } from "ejs"; const render = __spfxExternal2?.["render"];\nconst __spfxExternal0 = 1, __spfxExternal1 = 2;',
    );
    expect(rewrite("import { a } from 'ejs';\nimport { b } from '@scope/csp';")).toBe(
      'import { __spfxExternalModule as __spfxExternal0 } from "ejs"; const a = __spfxExternal0?.["a"];\n' +
        'import { __spfxExternalModule as __spfxExternal1 } from "@scope/csp"; const b = __spfxExternal1?.["b"];',
    );
  });

  it('returns a source map of the original module', () => {
    const rewritten = rewriteExternalImports("import { render } from 'ejs';\nrender('<%= a %>');\n", '/p/src/a.js', isConfigExternal);
    expect(rewritten?.map.sources).toEqual(['/p/src/a.js']);
    expect(rewritten?.map.sourcesContent).toEqual(["import { render } from 'ejs';\nrender('<%= a %>');\n"]);
    expect(rewritten?.map.mappings).not.toBe('');
  });

  it('ignores modules that do not parse', () => {
    expect(rewrite("import { render } from 'ejs'; const = ;")).toBeUndefined();
  });
});

function transform(plugin: Plugin, code: string, id: string) {
  const hook = plugin.transform as { handler: (code: string, id: string) => { code: string } | null };
  return hook.handler(code, id);
}

describe('externalImportsPlugin', () => {
  it('rewrites project sources only and warns about export * once per file', () => {
    const warn = vi.fn<(message: string) => void>();
    const plugin = externalImportsPlugin({ root: '/p', logger: { warn }, configExternalNames: () => externals, isConfigExternal });
    expect(transform(plugin, "import { render } from 'ejs';", '/p/src/a.ts')?.code).toContain('__spfxExternalModule');
    expect(transform(plugin, "import { render } from 'ejs';", '/p/node_modules/x/index.js')).toBeNull();
    expect(transform(plugin, "import { render } from 'ejs';", '/other/src/a.ts')).toBeNull();
    expect(transform(plugin, "import { render } from 'ejs-lint';", '/p/src/a.ts')).toBeNull();

    expect(transform(plugin, "export * from 'ejs';", '/p/src/b.ts')).toBeNull();
    expect(transform(plugin, "export * from 'ejs';", '/p/src/b.ts')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("src/b.ts: `export * from 'ejs'` re-exports nothing");
    expect(warn.mock.calls[0]?.[0]).toContain("`export * as ejs from 'ejs'`");
  });
});

describe('rewritten imports at runtime', () => {
  const host = globalThis as { window?: unknown };
  let outDir: string | undefined;

  afterEach(() => {
    delete host.window;
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it('reads properties like webpack: named, namespace (callable), default, re-exports, dynamic and undefined modules', async () => {
    const ApexCharts = Object.assign(
      class {
        readonly kind = 'chart';
      },
      { exec: () => 'exec' },
    );
    const loaded = new Map<string, unknown>([
      ['ejs', { render: (template: string) => `rendered ${template}` }],
      ['apexcharts', ApexCharts],
      ['@scope/csp', undefined],
    ]);
    host.window = { __spfxFastServe: { loadExternal: (name: string) => Promise.resolve(loaded.get(name)) } };
    const dir = mkdtempSync(path.join(tmpdir(), 'fast-serve-external-imports-'));
    outDir = dir;
    const facadeUrls = new Map<string, string>();
    for (const name of loaded.keys()) {
      const file = path.join(dir, `${name.replaceAll(/\W/g, '_')}.mjs`);
      writeFileSync(file, renderExternalEsmFacade(name));
      facadeUrls.set(name, pathToFileURL(file).href);
    }
    const source = [
      "import { render } from 'ejs';",
      "import * as ejs from 'ejs';",
      "import Charts, { exec } from 'apexcharts';",
      "import * as charts from 'apexcharts';",
      "import { csp } from '@scope/csp';",
      "export { render as renderTemplate } from 'ejs';",
      "export * as ejsModule from 'ejs';",
      "export const result = async () => ({ rendered: render('a'), viaNamespace: ejs.render('b'), fromDefault: new Charts() instanceof Charts,",
      "  fromNamespace: new charts() instanceof Charts, exec: exec(), csp, dynamic: (await import('ejs')).render('c'), dynamicDefault: (await import('apexcharts')).default === Charts });",
    ].join('\n');
    const rewritten = rewriteExternalImports(source, '/p/src/a.js', (name) => loaded.has(name))?.code ?? '';
    const file = path.join(dir, 'module.mjs');
    writeFileSync(file, rewritten.replaceAll(/(["'])(ejs|apexcharts|@scope\/csp)\1/g, (_, _quote: string, name: string) => JSON.stringify(facadeUrls.get(name))));
    const module = (await import(pathToFileURL(file).href)) as { result(): Promise<unknown>; renderTemplate: unknown; ejsModule: unknown };

    expect(await module.result()).toEqual({
      rendered: 'rendered a',
      viaNamespace: 'rendered b',
      fromDefault: true,
      fromNamespace: true,
      exec: 'exec',
      csp: undefined,
      dynamic: 'rendered c',
      dynamicDefault: true,
    });
    expect(module.renderTemplate).toBe((loaded.get('ejs') as { render: unknown }).render);
    expect(module.ejsModule).toBe(loaded.get('ejs'));
  });
});
