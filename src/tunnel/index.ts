import path from 'node:path';
import { rspack } from '@rspack/core';
import type { ConfigContribution, Feature, FeatureContext } from '../featureApi/index.js';
import { packageFile } from '../utils/packageFile.js';
import { toPosix } from '../utils/paths.js';

export { isTunnelServePlugin, TUNNEL_SERVE_PLUGIN, TunnelServePlugin, type TunnelServeOptions } from './plugin.js';
export { resolveTunnel, tunnelHostProblem, type ResolvedTunnel } from './resolve.js';

const CLEAR_CACHES_ENTRY = path.join('temp', 'fast-serve', 'tunnel', 'clear-caches.js');

export const tunnelFeature: Feature = { name: 'tunnel', contribute: tunnelContribution };

function tunnelContribution({ root, options }: FeatureContext): ConfigContribution {
  if (options.tunnelHost === undefined) return {};
  const entryFile = path.join(root, CLEAR_CACHES_ENTRY);
  return {
    plugins: [
      new rspack.experiments.VirtualModulesPlugin({ [entryFile]: clearCachesEntrySource(options.tunnelHost) }),
      new rspack.EntryPlugin(root, entryFile, { name: undefined }),
    ],
  };
}

export function clearCachesEntrySource(host: string): string {
  const runtime = toPosix(packageFile('./runtime/clearCaches', import.meta.url));
  return `import { clearTunnelCaches } from ${JSON.stringify(runtime)};\nclearTunnelCaches(${JSON.stringify(host)});\n`;
}
