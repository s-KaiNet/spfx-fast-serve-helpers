import path from 'node:path';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import { OPTIONS_FILE } from '../config/options.js';
import type { ServeContext } from '../context.js';
import { isObject } from '../utils/guards.js';
import { projectRelative } from './files.js';

interface ProtectedKey {
  key: string;
  read: (config: UserConfig) => unknown;
  alternative: string;
}

const USE_PORT_OPTION = `use --port or "port" in ${OPTIONS_FILE}`;

const PROTECTED_KEYS: readonly ProtectedKey[] = [
  { key: 'base', read: (config) => config.base, alternative: 'manifests and shims use absolute URLs from the origin' },
  { key: 'appType', read: (config) => config.appType, alternative: 'fast-serve serves no index.html' },
  { key: 'server.host', read: (config) => config.server?.host, alternative: 'fast-serve listens on localhost' },
  { key: 'server.port', read: (config) => config.server?.port, alternative: USE_PORT_OPTION },
  { key: 'server.strictPort', read: (config) => config.server?.strictPort, alternative: `the manifests point at one port; ${USE_PORT_OPTION}` },
  { key: 'server.origin', read: (config) => config.server?.origin, alternative: `derived from the port; ${USE_PORT_OPTION}` },
  { key: 'server.https', read: (config) => config.server?.https, alternative: 'fast-serve uses the SPFx development certificate' },
  { key: 'server.hmr.overlay', read: (config) => (isObject(config.server?.hmr) ? config.server.hmr.overlay : undefined), alternative: `use --no-overlay or "overlay" in ${OPTIONS_FILE}` },
  { key: 'css.modules', read: (config) => config.css?.modules, alternative: 'SPFx class names and theme tokens depend on fast-serve\'s CSS modules settings' },
  { key: 'define.DEBUG', read: (config) => config.define?.DEBUG as unknown, alternative: 'set by fast-serve' },
  { key: 'define["process.env.NODE_ENV"]', read: (config) => config.define?.['process.env.NODE_ENV'] as unknown, alternative: 'set by fast-serve' },
  { key: 'experimental.bundledDev', read: (config) => config.experimental?.bundledDev, alternative: 'not supported by fast-serve' },
  { key: 'build', read: (config) => config.build, alternative: 'fast-serve is a dev server; production builds stay on heft' },
];

export function protectedKeysIn(config: UserConfig, root: string): ProtectedKey[] {
  const found = PROTECTED_KEYS.filter(({ read }) => isSet(read(config)));
  if (config.root !== undefined && path.resolve(config.root) !== path.resolve(root)) {
    found.unshift({ key: 'root', read: (value) => value.root, alternative: 'fast-serve serves the project folder' });
  }
  return found;
}

function isSet(value: unknown): boolean {
  if (value === undefined) return false;
  if (isObject(value)) return Object.values(value).some((member) => member !== undefined);
  return true;
}

interface ExpectedValue {
  key: string;
  actual: (config: ResolvedConfig) => unknown;
  expected: unknown;
  alternative: string;
}

export function changedByPlugins(config: ResolvedConfig, { options }: Pick<ServeContext, 'options'>): string[] {
  const expectations: ExpectedValue[] = [
    { key: 'server.port', actual: (resolved) => resolved.server.port, expected: options.port, alternative: USE_PORT_OPTION },
    { key: 'server.origin', actual: (resolved) => resolved.server.origin, expected: options.origin, alternative: USE_PORT_OPTION },
    { key: 'appType', actual: (resolved) => resolved.appType, expected: 'custom', alternative: 'fast-serve serves no index.html' },
    { key: 'base', actual: (resolved) => resolved.base, expected: '/', alternative: 'manifests and shims use absolute URLs from the origin' },
  ];
  const changes = expectations
    .filter(({ actual, expected }) => actual(config) !== expected)
    .map(({ key, actual, expected, alternative }) => `"${key}" is ${JSON.stringify(actual(config))}, fast-serve needs ${JSON.stringify(expected)} (${alternative})`);
  if (!config.server.https) changes.push('"server.https" was removed, SharePoint pages load the components only over HTTPS');
  return changes;
}

export function viteExtendGuardPlugin(context: ServeContext, viteExtendFile: string, onLoaded: () => void): Plugin {
  const { root, logger } = context;
  const relativeFile = projectRelative(root, viteExtendFile);
  return {
    name: 'fast-serve:vite-extend-guard',
    config: {
      order: 'pre',
      handler(config) {
        onLoaded();
        for (const { key, alternative } of protectedKeysIn(config, root)) logger.warn(`${relativeFile}: "${key}" is ignored (${alternative})`);
      },
    },
    configResolved: {
      order: 'post',
      handler(config) {
        for (const change of changedByPlugins(config, context)) logger.warn(`a plugin from ${relativeFile} overrides fast-serve: ${change}`);
      },
    },
  };
}
