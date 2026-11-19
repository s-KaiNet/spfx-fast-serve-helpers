import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import type { UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import { toPosix } from '../utils/paths.js';
import { serverPlugin } from './index.js';

const root = fileURLToPath(new URL('../../test/fixtures/basic/', import.meta.url)).replace(/[\\/]$/, '');
const https = { cert: 'test-cert', key: 'test-key' };

function serveContext(logger: ServeContext['logger'] = { info: () => undefined, warn: () => undefined, error: () => undefined }): ServeContext {
  return {
    root,
    project: createProject(root, logger),
    logger,
    options: { port: 4400, origin: 'https://localhost:4400', locale: 'en-us', pageUrl: undefined, pageUrlTemplate: undefined, serveConfiguration: undefined, overlay: true, amdPackages: [], warnings: [] },
  };
}

function serverConfig(): UserConfig {
  return (serverPlugin(serveContext(), https).config as () => UserConfig)();
}

function startedServer() {
  const messages: string[] = [];
  const record = (message: string) => {
    messages.push(message);
  };
  const watcher = new EventEmitter() as EventEmitter & { add: (files: string[]) => void };
  watcher.add = () => undefined;
  const server = {
    watcher,
    restart: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    ws: { send: vi.fn<(payload: unknown) => void>() },
    environments: {},
  };
  const plugin = serverPlugin(serveContext({ info: record, warn: record, error: record }), https);
  (plugin.configureServer as (server: unknown) => void)(server);
  return { server, messages };
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

  it('does not warm up source files at startup', () => {
    expect(serverConfig().server?.warmup).toBeUndefined();
  });

  it('allows serving files from the workspace and this package', () => {
    const allowed = asStrings(serverConfig().server?.fs?.allow).map((folder) => path.resolve(folder));
    expect(allowed.some((folder) => root.startsWith(folder))).toBe(true);
    expect(allowed).toContain(path.resolve(fileURLToPath(new URL('../..', import.meta.url))));
  });
});

describe('server plugin project changes', () => {
  it('restarts the dev server when config/sass.json changes', () => {
    const { server, messages } = startedServer();

    server.watcher.emit('change', path.join(root, 'config/sass.json'));

    expect(server.restart).toHaveBeenCalledOnce();
    expect(server.ws.send).not.toHaveBeenCalled();
    expect(messages).toContain('config/sass.json changed, restarting the dev server');
  });

  it('reloads the page without a restart when config/serve.json changes', () => {
    const { server } = startedServer();

    server.watcher.emit('change', path.join(root, 'config/serve.json'));

    expect(server.restart).not.toHaveBeenCalled();
    expect(server.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });
  });
});
