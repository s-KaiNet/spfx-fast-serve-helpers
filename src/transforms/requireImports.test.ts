import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { tsconfigPathsPlugin } from '../aliases/index.js';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { requireImportsPlugin, rewriteLocalRequires } from './requireImports.js';

const id = '/project/src/webparts/hello/components/Hello.js';

function fixtureContext(root: string): ServeContext {
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { root, project: createProject(root, logger), logger, options: {} as ServeContext['options'] };
}

describe('rewriteLocalRequires', () => {
  it('hoists asset requires to URL imports and JSON requires to default imports', () => {
    const result = rewriteLocalRequires("const logo = require('./assets/logo.png');\nconst data = require('../data/t.json');\n", id);
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
    const result = rewriteLocalRequires(code, id);
    expect(result?.code).toContain('import __fastServeRequire0 from "./dark.svg?url";\nimport __fastServeRequire1 from "./light.svg?url";\n');
    expect(result?.code).toContain("src: props.dark ? __fastServeRequire0 : __fastServeRequire1, alt: __fastServeRequire0 }");
  });

  it('imports scripts and styles as namespaces and keeps existing queries', () => {
    const code = "const helpers = require('./helpers');\nconst styles = require('./Hello.module.scss');\nconst raw = require('./notes.txt?raw');\n";
    const result = rewriteLocalRequires(code, id);
    expect(result?.code).toContain('import * as __fastServeRequire0 from "./helpers";');
    expect(result?.code).toContain('import * as __fastServeRequire1 from "./Hello.module.scss";');
    expect(result?.code).toContain('import __fastServeRequire2 from "./notes.txt?raw&url";');
  });

  it('leaves package requires, dynamic requires and look-alikes untouched', () => {
    const code = [
      "const React = require('react');",
      'const dynamic = require(name);',
      "const text = \"require('./x.png')\";",
      "const resolved = require.resolve('./x.png');",
      "const pair = require('./a.png', 1);",
      '',
    ].join('\n');
    expect(rewriteLocalRequires(code, id)).toBeNull();
  });

  it('avoids identifiers that already exist in the module', () => {
    const result = rewriteLocalRequires("const __fastServeRequire0 = 1;\nconst logo = require('./logo.png');\n", id);
    expect(result?.code).toContain('import __fastServeRequire0_ from "./logo.png?url";');
    expect(result?.code).toContain('const logo = __fastServeRequire0_;');
  });

  it('produces a source map that keeps the original lines', () => {
    const result = rewriteLocalRequires("const a = 1;\nconst logo = require('./logo.png');\n", id);
    expect(result?.map.sources).toEqual([id]);
    expect(result?.map.sourcesContent).toEqual(["const a = 1;\nconst logo = require('./logo.png');\n"]);
    expect(result?.map.mappings.startsWith(';AAAA')).toBe(true);
  });
});

describe('rewriteLocalRequires with tsconfig path aliases', () => {
  it('rewrites requires of aliased specifiers and leaves packages alone', () => {
    const code = "const logo = require('@assets/logo.png');\nconst $ = require('jquery');\n";
    const result = rewriteLocalRequires(code, id, (specifier) => specifier.startsWith('@assets/'));
    expect(result?.code).toBe(['import __fastServeRequire0 from "@assets/logo.png?url";', 'const logo = __fastServeRequire0;', "const $ = require('jquery');", ''].join('\n'));
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
