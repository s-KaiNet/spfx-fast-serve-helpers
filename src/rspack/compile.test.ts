import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from '../logger.js';
import { createProject } from '../project/index.js';
import type { BuildContext } from '../featureApi/index.js';
import { compileOnce, type CompileResult } from './index.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/compile', import.meta.url));
const ORIGIN = 'https://localhost:4433';

interface AmdModule {
  dependencies: string[];
  exports: Record<string, unknown>;
}

function buildContext(root: string, locale: string, messages: string[]): BuildContext {
  const logger: Logger = {
    info: (message) => messages.push(`info: ${message}`),
    warn: (message) => messages.push(`warn: ${message}`),
    error: (message) => messages.push(`error: ${message}`),
  };
  return { root, project: createProject(root, logger), options: { origin: ORIGIN, locale, overlay: true }, logger };
}

function evaluateAmd(source: string, externals: Record<string, unknown>): AmdModule {
  let captured: { dependencies: string[]; factory: (...args: unknown[]) => unknown } | undefined;
  const sandbox: Record<string, unknown> = {
    define: (dependencies: string[], factory: (...args: unknown[]) => unknown) => {
      captured = { dependencies, factory };
    },
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.setTimeout = () => 0;
  vm.runInNewContext(source, sandbox);
  if (!captured) throw new Error('the bundle did not call define()');
  const { dependencies, factory } = captured;
  const exports = factory(...dependencies.map((name) => externals[name])) as Record<string, unknown>;
  return { dependencies, exports };
}

class FakeBaseClientSideWebPart {
  public readonly context: string = 'fake';
}
const fakeExternals: Record<string, unknown> = {
  '@microsoft/sp-core-library': { Version: { parse: (value: string) => `parsed ${value}` } },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart: FakeBaseClientSideWebPart },
  '@microsoft/microsoft-graph-client': { GraphClient: FakeBaseClientSideWebPart },
};

describe('compileOnce on a fixture project', () => {
  let outputPath: string;
  let result: CompileResult;
  const messages: string[] = [];
  const read = (file: string): string => readFileSync(path.join(outputPath, file), 'utf8');

  beforeAll(async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-compile-'));
    cpSync(fixture, root, { recursive: true });
    outputPath = path.join(root, 'out');
    result = await compileOnce(buildContext(root, 'en-us', messages), { outputPath });
    return () => {
      rmSync(root, { recursive: true, force: true });
    };
  }, 60_000);

  it('compiles every bundle without errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.assets).toEqual(expect.arrayContaining(['single-web-part.js', 'shared-bundle.js']));
    expect(messages.filter((message) => !message.includes('@microsoft/sp-css-loader'))).toEqual([]);
  });

  it('starts every bundle with the page runtime, before the component code, and without the tunnel cache script', () => {
    for (const [bundle, entryModule] of [['single-web-part.js', './src/webparts/hello/HelloWebPart.ts'], ['shared-bundle.js', './temp/fast-serve/bundle-entries/shared-bundle.js']] as const) {
      const source = read(bundle);
      expect(source.split(`"reportUrl":"${ORIGIN}/fast-serve/browser-errors"`)).toHaveLength(2);
      const pageRuntime = source.lastIndexOf('__webpack_require__("./temp/fast-serve/page-runtime/page-runtime.js")');
      expect(pageRuntime).toBeGreaterThan(-1);
      expect(pageRuntime).toBeLessThan(source.lastIndexOf(`__webpack_require__("${entryModule}")`));
      expect(source).not.toContain('clearTunnelCaches');
    }
  });

  it('emits anonymous AMD modules that declare the SPFx libraries they use as dependencies', () => {
    const single = read('single-web-part.js');
    expect(single.trimStart()).toMatch(/^define\(\[/);
    expect(evaluateAmd(single, fakeExternals).dependencies.toSorted()).toEqual(['@microsoft/sp-core-library', '@microsoft/sp-webpart-base']);
    expect(evaluateAmd(read('shared-bundle.js'), fakeExternals).dependencies.toSorted()).toEqual([
      '@microsoft/microsoft-graph-client',
      '@microsoft/sp-core-library',
    ]);
  });

  it('keeps library code out of the bundles and bundles the project React for nested copies too', () => {
    const sources = read('single-web-part.js') + read('shared-bundle.js');
    for (const marker of ['SP_CORE_LIBRARY_SOURCE', 'SP_WEBPART_BASE_SOURCE', 'GRAPH_CLIENT_SOURCE', 'NESTED_REACT_COPY']) {
      expect(sources).not.toContain(marker);
    }
    expect(sources).toContain('PROJECT_REACT_COPY');
  });

  it('exports the component class of a single-component bundle as the module', () => {
    const { exports } = evaluateAmd(read('single-web-part.js'), fakeExternals);
    const WebPart = exports.default as new () => Record<string, unknown> & { render(): { props: Record<string, unknown> } };
    const webPart = new WebPart();
    expect(webPart).toBeInstanceOf(FakeBaseClientSideWebPart);
    expect(webPart).toMatchObject({
      title: 'Hello from en-us',
      debug: true,
      environment: 'development',
      settings: { color: 'blue' },
    });
    expect(webPart.logo).toMatch(new RegExp(`^${ORIGIN}/dist/logo_[0-9a-f]+\\.png$`));
    expect(webPart.render()).toMatchObject({ type: 'div', props: { title: 'Hello from en-us', children: ['18.3.1'] } });
    expect(result.assets.some((asset) => /^logo_[0-9a-f]+\.png$/.test(asset))).toBe(true);
  });

  it('exports each component of a multi-component bundle under its export name', () => {
    const { exports } = evaluateAmd(read('shared-bundle.js'), fakeExternals);
    expect(Object.keys(exports).toSorted()).toEqual(['a', 'b']);
    const first = exports.a as { default: new () => { version: string } };
    const banner = exports.b as { default: new () => { kind: string } };
    expect(new first.default().version).toBe('parsed 1.0');
    expect(new banner.default().kind).toBe('banner');
  });
});

describe('compileOnce with another locale', () => {
  it('bundles the strings of the selected locale', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-compile-'));
    try {
      cpSync(fixture, root, { recursive: true });
      const outputPath = path.join(root, 'out');
      const result = await compileOnce(buildContext(root, 'de-de', []), { outputPath });
      expect(result.errors).toEqual([]);
      const { exports } = evaluateAmd(readFileSync(path.join(outputPath, 'single-web-part.js'), 'utf8'), fakeExternals);
      const WebPart = exports.default as new () => { title: string };
      expect(new WebPart().title).toBe('Hallo');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

function packageDirectory(request: string): string {
  const manifest = createRequire(import.meta.url).resolve(`${request}/package.json`);
  return path.dirname(manifest);
}

describe('compileOnce with styles', () => {
  it('compiles CSS modules from Sass with SPFx class names and keeps theme tokens for load-themed-styles', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-compile-'));
    try {
      cpSync(fixture, root, { recursive: true });
      mkdirSync(path.join(root, 'node_modules', '@microsoft'), { recursive: true });
      symlinkSync(packageDirectory('@microsoft/sp-css-loader'), path.join(root, 'node_modules', '@microsoft', 'sp-css-loader'), 'dir');
      symlinkSync(path.resolve(createRequire(import.meta.url).resolve('sass-embedded'), '../../..'), path.join(root, 'node_modules', 'sass-embedded'), 'dir');
      const components = path.join(root, 'src', 'webparts', 'hello', 'components');
      writeFileSync(path.join(components, '_colors.scss'), '$primary: "[theme:themePrimary, default:#0078d4]";\n');
      writeFileSync(path.join(components, 'Hello.module.scss'), "@use 'colors';\n.hello { color: colors.$primary; .inner { margin: 0; } }\n");
      writeFileSync(
        path.join(components, 'Hello.tsx'),
        "import * as React from 'react';\nimport styles from './Hello.module.scss';\nimport type { IHelloProps } from './IHelloProps';\n" +
          'export function renderHello({ title }: IHelloProps): unknown {\n  return <div className={styles.hello} title={title} />;\n}\n',
      );
      const messages: string[] = [];
      const outputPath = path.join(root, 'out');
      const result = await compileOnce(buildContext(root, 'en-us', messages), { outputPath });
      expect(result.errors).toEqual([]);
      expect(messages).toEqual([]);
      const source = readFileSync(path.join(outputPath, 'single-web-part.js'), 'utf8');
      expect(source).toContain('[theme:themePrimary, default:#0078d4]');
      const WebPart = evaluateAmd(source, fakeExternals).exports.default as new () => { render(): { props: { className: string } } };
      expect(new WebPart().render().props.className).toMatch(/^hello_[0-9a-f]{8}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
