import type { Configuration, DevServer } from '@rspack/core';
import { OPTIONS_FILE } from '../config/options.js';

export interface IgnoredKey {
  key: string;
  alternative: string;
}

export interface GuardedExtend {
  config: Configuration;
  devServer: DevServer | undefined;
  ignored: IgnoredKey[];
  notes: string[];
}

const USE_PORT_OPTION = `use --port or "port" in ${OPTIONS_FILE}`;
const AMD_OUTPUT = 'SharePoint loads fast-serve\'s AMD bundles from https://localhost:<port>/dist/';

const CONFIG_KEYS: Readonly<Record<string, string>> = {
  entry: 'fast-serve creates one entry per bundle from config/config.json',
  mode: 'fast-serve is a development server; production builds stay on heft',
  context: 'fast-serve compiles the project folder',
  target: 'SharePoint runs the bundles in the browser',
  amd: 'AMD and UMD code in dependencies needs webpack\'s AMD parsing',
  externalsType: 'SharePoint resolves externals with RequireJS (AMD); add externals to config/config.json "externals"',
};

const OUTPUT_KEYS: Readonly<Record<string, string>> = {
  publicPath: `${AMD_OUTPUT}; ${USE_PORT_OPTION}`,
  library: AMD_OUTPUT,
  libraryTarget: AMD_OUTPUT,
  path: 'bundles are served from memory',
};

const DEV_SERVER_KEYS: Readonly<Record<string, string>> = {
  port: USE_PORT_OPTION,
  host: 'fast-serve listens on localhost',
  server: 'fast-serve uses the SPFx development certificate (HTTPS)',
  https: 'fast-serve uses the SPFx development certificate (HTTPS)',
  hot: 'HMR and React Fast Refresh are set up by fast-serve',
  liveReload: 'HMR and React Fast Refresh are set up by fast-serve',
  client: `the overlay is fast-serve's: use --no-overlay or "overlay" in ${OPTIONS_FILE}`,
  webSocketServer: 'the pages connect to fast-serve\'s websocket',
  devMiddleware: 'bundles are served from memory under /dist/',
  allowedHosts: 'SharePoint pages must reach the server from the tenant origin',
};

function withoutKeys(value: object, keys: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key)));
}

function setKeys(value: object, owned: Readonly<Record<string, string>>): string[] {
  return Object.entries(value).flatMap(([key, member]) => (member !== undefined && key in owned ? [key] : []));
}

export function guardExtendConfig(config: Configuration): GuardedExtend {
  const ignored: IgnoredKey[] = setKeys(config, CONFIG_KEYS).map((key) => ({ key, alternative: CONFIG_KEYS[key] ?? '' }));
  for (const key of Object.keys(config.output ?? {})) ignored.push({ key: `output.${key}`, alternative: OUTPUT_KEYS[key] ?? AMD_OUTPUT });
  const notes: string[] = [];
  if (config.externals !== undefined) {
    notes.push('"externals" are applied, but the debug manifests don\'t list them, so SharePoint only finds them when the page already loaded them; prefer config/config.json "externals" (heft reads it too)');
  }
  let devServer: DevServer | undefined;
  if (config.devServer === false) ignored.push({ key: 'devServer', alternative: 'fast-serve is the dev server' });
  else if (config.devServer !== undefined) {
    const ownedDevServerKeys = setKeys(config.devServer, DEV_SERVER_KEYS);
    for (const key of ownedDevServerKeys) ignored.push({ key: `devServer.${key}`, alternative: DEV_SERVER_KEYS[key] ?? '' });
    devServer = withoutKeys(config.devServer, new Set(ownedDevServerKeys));
  }
  const kept = withoutKeys(config, new Set([...Object.keys(CONFIG_KEYS), 'output', 'devServer']));
  return { config: kept, devServer, ignored, notes };
}
