import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { serverPlugin } from '../server/index.js';
import { stylesPlugin } from '../styles/index.js';
import { definesPlugin } from '../transforms/defines.js';
import { toPosix } from '../utils/paths.js';
import { publishFastServeContext } from './context.js';
import { findViteExtendFile } from './files.js';
import { viteExtendGuardPlugin } from './guard.js';
import { viteExtendWatchPlugin } from './watch.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/basic', import.meta.url));
const publicEntry = toPosix(fileURLToPath(new URL('../index.ts', import.meta.url)));
const https = { cert: 'test-cert', key: 'test-key' };

let activeServer: ViteDevServer | undefined;
let projectRoot: string | undefined;

afterEach(async () => {
  await activeServer?.close();
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  activeServer = undefined;
  projectRoot = undefined;
});

function createProjectCopy(files: Record<string, string>): string {
  projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-vite-extend-server-'));
  cpSync(fixture, projectRoot, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules`) });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), content);
  }
  return projectRoot;
}

async function serve(files: Record<string, string>) {
  const root = createProjectCopy(files);
  const warnings: string[] = [];
  const errors: string[] = [];
  const logger = { info: () => undefined, warn: (message: string) => message.includes('vite.extend') && warnings.push(message), error: (message: string) => errors.push(message) };
  const context: ServeContext = { root, project: createProject(root, logger), logger, options: resolveOptions({ cli: { port: 4400 } }, {}) };
  publishFastServeContext({
    root,
    port: 4400,
    origin: context.options.origin,
    locale: 'en-us',
    serveConfiguration: 'default',
    pageUrl: undefined,
    spfxVersion: '1.24.1',
    fastServeVersion: '1.24.0',
    viteVersion: '8.3.8',
  });
  const viteExtendFile = findViteExtendFile(root);
  const requestFullRestart = vi.fn<(reason: string) => void>();
  const plugins: Plugin[] = [serverPlugin(context, https), definesPlugin(), stylesPlugin(context), viteExtendWatchPlugin(context, viteExtendFile, requestFullRestart)];
  if (viteExtendFile) plugins.push(viteExtendGuardPlugin(context, viteExtendFile, () => undefined));
  const server = await createServer({
    root,
    configFile: viteExtendFile ?? false,
    configLoader: 'bundle',
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false },
    plugins,
  });
  activeServer = server;
  return { root, server, warnings, errors, requestFullRestart };
}

const helpers = 'module.exports = { apiUrl: () => "https://api.example/v1", buildVersion: () => "1.0.0.0" };\n';

const functionConfig = `import path from 'node:path';
import { defineConfig } from '${publicEntry}';
import { apiUrl, buildVersion } from '../scripts/helpers.cjs';

export default defineConfig(({ root, port, serveConfiguration }, env) => ({
  define: {
    CONTOSO_API: JSON.stringify(apiUrl()),
    CONTOSO_BUILD_VERSION: JSON.stringify(buildVersion()),
    CONTEXT_INFO: JSON.stringify(\`\${port}|\${serveConfiguration}|\${env.command}\`),
  },
  resolve: { alias: { '@src': path.join(root, 'src') } },
  plugins: [{ name: 'user-plugin' }],
}));
`;

describe('fast-serve/vite.extend.*', () => {
  it('loads a defineConfig function from .mts with the context and local CommonJS helpers', async () => {
    const { root, server } = await serve({ 'scripts/helpers.cjs': helpers, 'fast-serve/vite.extend.mts': functionConfig });
    expect(server.config.define).toMatchObject({
      CONTOSO_API: '"https://api.example/v1"',
      CONTOSO_BUILD_VERSION: '"1.0.0.0"',
      CONTEXT_INFO: '"4400|default|serve"',
      DEBUG: 'true',
      'process.env.NODE_ENV': '"development"',
    });
    expect(server.config.configFileDependencies.map((file) => path.basename(file))).toEqual(expect.arrayContaining(['vite.extend.mts', 'helpers.cjs']));
    const resolved = await server.environments.client.pluginContainer.resolveId('@src/webparts/hello/HelloWebPart.ts', path.join(root, 'src/index.ts'));
    expect(resolved?.id).toBe(toPosix(path.join(root, 'src/webparts/hello/HelloWebPart.ts')));
  });

  it('adds user plugins and aliases to fast-serve\'s', async () => {
    const { server } = await serve({ 'scripts/helpers.cjs': helpers, 'fast-serve/vite.extend.mts': functionConfig });
    const names = server.config.plugins.map(({ name }) => name);
    expect(names).toEqual(expect.arrayContaining(['user-plugin', 'fast-serve:server', 'fast-serve:defines', 'fast-serve:vite-extend-guard']));
    expect(server.config.resolve.alias).toEqual(expect.arrayContaining([expect.objectContaining({ find: '@src' })]));
    expect(server.config.resolve.dedupe).toEqual(expect.arrayContaining(['react', 'react-dom']));
  });

  it('loads a plain object from .js and an async function', async () => {
    const plain = await serve({ 'fast-serve/vite.extend.js': 'export default { define: { PLAIN: JSON.stringify("yes") } };\n' });
    expect(plain.server.config.define?.PLAIN).toBe('"yes"');
    await activeServer?.close();
    rmSync(plain.root, { recursive: true, force: true });
    const asyncConfig = await serve({
      'fast-serve/vite.extend.mts': `import { defineConfig } from '${publicEntry}';\nexport default defineConfig(async ({ locale }) => ({ define: { LOCALE: JSON.stringify(await Promise.resolve(locale)) } }));\n`,
    });
    expect(asyncConfig.server.config.define?.LOCALE).toBe('"en-us"');
  });

  it('keeps fast-serve\'s own settings over protected keys and warns about each', async () => {
    const { server, warnings } = await serve({
      'fast-serve/vite.extend.mts': `export default {
  base: '/elsewhere/',
  appType: 'spa',
  server: { port: 5555, origin: 'https://localhost:5555', proxy: { '/api': 'https://api.example' } },
  css: { modules: { generateScopedName: '[name]' } },
  define: { DEBUG: 'false', MY_CONSTANT: '1' },
};
`,
    });
    expect(server.config.server.port).toBe(4400);
    expect(server.config.server.origin).toBe('https://localhost:4400');
    expect(server.config.base).toBe('/');
    expect(server.config.appType).toBe('custom');
    expect(server.config.css.modules).toMatchObject({ generateScopedName: '[local]_[hash:base64:8]' });
    expect(server.config.define).toMatchObject({ DEBUG: 'true', MY_CONSTANT: '1' });
    expect(server.config.server.proxy).toHaveProperty('/api');
    expect(warnings).toEqual([
      'fast-serve/vite.extend.mts: "base" is ignored (manifests and shims use absolute URLs from the origin)',
      'fast-serve/vite.extend.mts: "appType" is ignored (fast-serve serves no index.html)',
      'fast-serve/vite.extend.mts: "server.port" is ignored (use --port or "port" in fast-serve/config.json)',
      'fast-serve/vite.extend.mts: "server.origin" is ignored (derived from the port; use --port or "port" in fast-serve/config.json)',
      'fast-serve/vite.extend.mts: "css.modules" is ignored (SPFx class names and theme tokens depend on fast-serve\'s CSS modules settings)',
      'fast-serve/vite.extend.mts: "define.DEBUG" is ignored (set by fast-serve)',
    ]);
  });

  it('warns when a user plugin overrides fast-serve settings after it', async () => {
    const { server, warnings } = await serve({
      'fast-serve/vite.extend.mts': `export default {
  plugins: [{ name: 'late', enforce: 'post', config: () => ({ server: { origin: 'https://localhost:9999' } }) }],
};
`,
    });
    expect(server.config.server.origin).toBe('https://localhost:9999');
    expect(warnings).toEqual([
      'a plugin from fast-serve/vite.extend.mts overrides fast-serve: "server.origin" is "https://localhost:9999", fast-serve needs "https://localhost:4400" (use --port or "port" in fast-serve/config.json)',
    ]);
  });

  it('requests a full restart when the file is added', async () => {
    const { root, server, requestFullRestart } = await serve({});
    const file = path.join(root, 'fast-serve/vite.extend.mts');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'export default {};\n');
    server.watcher.emit('add', file);
    await vi.waitFor(() => {
      expect(requestFullRestart).toHaveBeenCalledWith('fast-serve/vite.extend.mts found, restarting fast-serve');
    });
    expect(requestFullRestart).toHaveBeenCalledTimes(1);
  });

  it('requests a full restart when the file is deleted, without Vite\'s own restart', async () => {
    const { root, server, requestFullRestart } = await serve({ 'fast-serve/vite.extend.mts': 'export default {};\n' });
    const file = path.join(root, 'fast-serve/vite.extend.mts');
    unlinkSync(file);
    server.watcher.emit('unlink', file);
    await vi.waitFor(() => {
      expect(requestFullRestart).toHaveBeenCalledWith('fast-serve/vite.extend.mts was removed, restarting fast-serve');
    });
    expect(server.config.configFile).toBeUndefined();
    expect(server.config.configFileDependencies.map((dependency) => path.basename(dependency))).not.toContain('vite.extend.mts');
  });

  it('keeps the running server when an added file is broken and restarts once it is fixed', async () => {
    const { root, server, errors, requestFullRestart } = await serve({});
    const file = path.join(root, 'fast-serve/vite.extend.mts');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'export default {\n');
    server.watcher.emit('add', file);
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0]).toMatch(/^fast-serve\/vite\.extend\.mts could not be loaded: .+\nThe server keeps running without it; fast-serve restarts when the file is fixed\.$/s);
    expect(requestFullRestart).not.toHaveBeenCalled();
    writeFileSync(file, 'export default {};\n');
    server.watcher.emit('change', file);
    await vi.waitFor(() => {
      expect(requestFullRestart).toHaveBeenCalledTimes(1);
    });
  });

  it('leaves changes of the loaded file to Vite', async () => {
    const { root, server, requestFullRestart } = await serve({ 'fast-serve/vite.extend.mts': 'export default {};\n' });
    server.watcher.emit('change', path.join(root, 'fast-serve/vite.extend.mts'));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(requestFullRestart).not.toHaveBeenCalled();
  });
});
