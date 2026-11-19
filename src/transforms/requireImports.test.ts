import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { tsconfigPathsPlugin } from '../aliases/index.js';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { requireImportsPlugin, rewriteRequires, type RequireResolution } from './requireImports.js';

const id = '/project/src/webparts/hello/components/Hello.js';

function fixtureContext(root: string): ServeContext {
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { root, project: createProject(root, logger), logger, options: {} as ServeContext['options'] };
}

function rewrite(code: string, resolution?: Partial<RequireResolution>) {
  return rewriteRequires(code, id, { isPathAlias: () => false, isExternalModule: () => false, ...resolution }).rewritten;
}

describe('rewriteRequires with local files', () => {
  it('hoists asset requires to URL imports and JSON requires to default imports', () => {
    const result = rewrite("const logo = require('./assets/logo.png');\nconst data = require('../data/t.json');\n");
    expect(result?.code).toBe(
      [
        'import __fastServeRequire0 from "./assets/logo.png?url";',
        'import __fastServeRequire1 from "../data/t.json";',
        'const logo = __fastServeRequire0;',
        'const data = __fastServeRequire1;',
        '',
      ].join('\n'),
    );
  });

  it('rewrites requires inside expressions and reuses one import per specifier', () => {
    const code = [
      'export function Logo(props) {',
      "  return jsx('img', { src: props.dark ? require('./dark.svg') : require('./light.svg'), alt: require('./dark.svg') });",
      '}',
      '',
    ].join('\n');
    const result = rewrite(code);
    expect(result?.code).toContain('import __fastServeRequire0 from "./dark.svg?url";\nimport __fastServeRequire1 from "./light.svg?url";\n');
    expect(result?.code).toContain("src: props.dark ? __fastServeRequire0 : __fastServeRequire1, alt: __fastServeRequire0 }");
  });

  it('imports scripts and styles as namespaces and keeps existing queries', () => {
    const code = "const helpers = require('./helpers');\nconst styles = require('./Hello.module.scss');\nconst raw = require('./notes.txt?raw');\n";
    const result = rewrite(code);
    expect(result?.code).toContain('import * as __fastServeRequire0 from "./helpers";');
    expect(result?.code).toContain('import * as __fastServeRequire1 from "./Hello.module.scss";');
    expect(result?.code).toContain('import __fastServeRequire2 from "./notes.txt?raw&url";');
  });

  it('leaves dynamic requires and look-alikes untouched', () => {
    const code = [
      'const dynamic = require(name);',
      "const text = \"require('./x.png')\";",
      "const resolved = require.resolve('./x.png');",
      "const context = require.context('./icons', true);",
      "require.ensure(['./a'], () => undefined);",
      "const pair = require('./a.png', 1);",
      'const isCommonJs = typeof require === "function";',
      "const url = require('https://cdn.example/x.js');",
      '',
    ].join('\n');
    expect(rewrite(code)).toBeUndefined();
  });

  it('avoids identifiers that already exist in the module', () => {
    const result = rewrite("const __fastServeRequire0 = 1;\nconst logo = require('./logo.png');\n");
    expect(result?.code).toContain('import __fastServeRequire0_ from "./logo.png?url";');
    expect(result?.code).toContain('const logo = __fastServeRequire0_;');
  });

  it('produces a source map that keeps the original lines', () => {
    const result = rewrite("const a = 1;\nconst logo = require('./logo.png');\n");
    expect(result?.map.sources).toEqual([id]);
    expect(result?.map.sourcesContent).toEqual(["const a = 1;\nconst logo = require('./logo.png');\n"]);
    expect(result?.map.mappings.startsWith(';AAAA')).toBe(true);
  });
});

describe('rewriteRequires with tsconfig path aliases', () => {
  it('rewrites requires of aliased specifiers like relative ones', () => {
    const code = "const logo = require('@assets/logo.png');\n";
    const result = rewrite(code, { isPathAlias: (specifier) => specifier.startsWith('@assets/') });
    expect(result?.code).toBe(['import __fastServeRequire0 from "@assets/logo.png?url";', 'const logo = __fastServeRequire0;', ''].join('\n'));
  });
});

describe('rewriteRequires with package names', () => {
  const helper =
    'function __fastServeRequireValue(namespace) { return Object.prototype.toString.call(namespace) === "[object Module]" || namespace.__esModule ? namespace : namespace.default; }';

  it('imports a bare package as a namespace and unwraps it to the CommonJS or ES module value', () => {
    expect(rewrite("const dayjs = require('dayjs');\n")?.code).toBe(
      ['import * as __fastServeRequire0 from "dayjs";', helper, 'const dayjs = __fastServeRequireValue(__fastServeRequire0);', ''].join('\n'),
    );
  });

  it('rewrites scoped deep paths and side-effect-only requires', () => {
    const code = "require('@microsoft/mgt-components/dist/es6/components/mgt-person/mgt-person');\nrequire('side-effect-pkg');\n";
    const result = rewrite(code)?.code;
    expect(result).toContain('import * as __fastServeRequire0 from "@microsoft/mgt-components/dist/es6/components/mgt-person/mgt-person";');
    expect(result).toContain('import * as __fastServeRequire1 from "side-effect-pkg";');
    expect(result).toContain('__fastServeRequireValue(__fastServeRequire0);\n__fastServeRequireValue(__fastServeRequire1);\n');
  });

  it('uses one import for a package required twice', () => {
    const result = rewrite("require('side-effect-pkg');\nconst value = require('side-effect-pkg');\n")?.code ?? '';
    expect(result.match(/import \* as/g)).toHaveLength(1);
    expect(result).toContain('const value = __fastServeRequireValue(__fastServeRequire0);');
  });

  it('gives SPFx libraries and config.json externals the module object exactly as RequireJS returns it', () => {
    const code = "const core = require('@microsoft/sp-core-library');\nconst $ = require('jquery');\n";
    const result = rewrite(code, { isExternalModule: (specifier) => specifier === 'jquery' || specifier === '@microsoft/sp-core-library' })?.code;
    expect(result).toBe(
      [
        'import { __spfxExternalModule as __fastServeRequire0 } from "@microsoft/sp-core-library";',
        'import { __spfxExternalModule as __fastServeRequire1 } from "jquery";',
        'const core = __fastServeRequire0;',
        'const $ = __fastServeRequire1;',
        '',
      ].join('\n'),
    );
  });

  it('keeps JSON, style and asset handling for package files', () => {
    const code = [
      "const data = require('some-pkg/data.json');",
      "require('some-pkg/dist/styles.css');",
      "const icon = require('some-pkg/icons/check.svg');",
      "const debounce = require('lodash.debounce');",
      '',
    ].join('\n');
    const result = rewrite(code)?.code;
    expect(result).toContain('import __fastServeRequire0 from "some-pkg/data.json";');
    expect(result).toContain('import * as __fastServeRequire1 from "some-pkg/dist/styles.css";');
    expect(result).toContain('import __fastServeRequire2 from "some-pkg/icons/check.svg?url";');
    expect(result).toContain('import * as __fastServeRequire3 from "lodash.debounce";');
    expect(result).toContain('const data = __fastServeRequire0;\n__fastServeRequire1;\nconst icon = __fastServeRequire2;');
  });

  it('places the generated imports after the last import declaration of the file', () => {
    const code = ["import React from 'react';", "import { a } from './a';", "require('side-effect-pkg');", ''].join('\n');
    expect(rewrite(code)?.code).toBe(
      [
        "import React from 'react';",
        "import { a } from './a';",
        'import * as __fastServeRequire0 from "side-effect-pkg";',
        helper,
        '__fastServeRequireValue(__fastServeRequire0);',
        '',
      ].join('\n'),
    );
  });

  it('places the generated imports after leading directives', () => {
    expect(rewrite("'use strict';\nrequire('x');\n")?.code).toBe(
      ["'use strict';", 'import * as __fastServeRequire0 from "x";', helper, '__fastServeRequireValue(__fastServeRequire0);', ''].join('\n'),
    );
  });

  it('leaves a require that is a local binding alone', () => {
    const code = [
      'function load(require) { return require("pkg-a"); }',
      'const run = (require) => require("pkg-b");',
      'function inner() { var require = window.myRequire; return require("pkg-c"); }',
      'try { x(); } catch (require) { require("pkg-d"); }',
      '{ const require = createRequire(); require("pkg-e"); }',
      'function outer() { function require(name) { return name; } return require("pkg-f"); }',
      'const { require: { nested } } = api;',
      'const shadowed = ({ require }) => require("pkg-g");',
      'const late = function () { return require("pkg-h"); var require = null; };',
      'export const real = require("pkg-real");',
      '',
    ].join('\n');
    const result = rewrite(code)?.code ?? '';
    expect(result.match(/import \* as/g)).toHaveLength(1);
    expect(result).toContain('import * as __fastServeRequire0 from "pkg-real";');
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) expect(result).toContain(`require("pkg-${name}")`);
  });

  it('leaves every require alone when the module declares require at the top level', () => {
    expect(rewrite("import require from 'my-require';\nrequire('pkg');\n")).toBeUndefined();
    expect(rewrite("var require = window.require;\nrequire('pkg');\n")).toBeUndefined();
  });

  it('reports a computed require it leaves as is', () => {
    expect(rewriteRequires('const value = require(name);\n', id).skippedDynamicRequire).toBe(true);
    expect(rewriteRequires('function f(require) { return require(name); }\n', id).skippedDynamicRequire).toBe(false);
    expect(rewriteRequires("require(['jquery'], (jquery) => jquery);\n", id).skippedDynamicRequire).toBe(false);
    const mixed = rewriteRequires("const a = require(name);\nconst b = require('pkg');\n", id);
    expect(mixed.skippedDynamicRequire).toBe(true);
    expect(mixed.rewritten?.code).toContain('from "pkg"');
  });

  it('accepts template literals without expressions', () => {
    expect(rewrite('const dayjs = require(`dayjs`);\n')?.code).toContain('import * as __fastServeRequire0 from "dayjs";');
  });
});

describe('requireImportsPlugin in Vite', () => {
  let projectRoot: string | undefined;
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    projectRoot = undefined;
  });

  async function serve(files: Record<string, string>): Promise<ViteDevServer> {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-require-'));
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), content);
    }
    const context = fixtureContext(projectRoot);
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, origin: 'https://localhost:4400' },
      plugins: [tsconfigPathsPlugin(context), requireImportsPlugin(context)],
    });
    return server;
  }

  it('turns TypeScript requires into imports that resolve to absolute asset URLs and parsed JSON', async () => {
    const vite = await serve({
      'src/Hello.ts': "const logo: any = require('./assets/logo.png');\nconst data: { title: string } = require('./data.json');\nexport const view = { src: logo, alt: data.title };\n",
      'src/assets/logo.png': 'png',
      'src/data.json': '{ "title": "Hello" }',
      'node_modules/dep/index.js': "module.exports = require('./logo.png');\n",
    });
    const client = vite.environments.client;

    const hello = await client.transformRequest('/src/Hello.ts');
    expect(hello?.code).toMatch(/import __fastServeRequire0 from "\/src\/assets\/logo\.png\?(import&)?url";/);
    expect(hello?.code).toMatch(/import __fastServeRequire1 from "\/src\/data\.json(\?import)?";/);
    expect(hello?.code).not.toContain('require(');

    const asset = await client.transformRequest('/src/assets/logo.png?url');
    expect(asset?.code).toBe('export default "https://localhost:4400/src/assets/logo.png"');

    const json = await client.transformRequest('/src/data.json');
    expect(json?.code).toContain('export default');

    const dependency = await client.transformRequest('/node_modules/dep/index.js');
    expect(dependency?.code).toContain("require('./logo.png')");
  });

  it('resolves required tsconfig path aliases to asset URLs', async () => {
    const vite = await serve({
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@assets/*': ['./src/assets/*'] } } }),
      'src/Hello.ts': "const logo: any = require('@assets/logo.png');\nexport const view = { src: logo };\n",
      'src/assets/logo.png': 'png',
    });
    const hello = await vite.environments.client.transformRequest('/src/Hello.ts');
    expect(hello?.code).toMatch(/import __fastServeRequire0 from "\/src\/assets\/logo\.png\?(import&)?url";/);
    expect(hello?.code).not.toContain('require(');
  });
});
