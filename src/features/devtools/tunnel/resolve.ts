import type { Configuration } from '@rspack/core';
import { isTunnelServePlugin } from './plugin.js';

export interface ResolvedTunnel {
  config: Configuration;
  host: string | undefined;
  warnings: string[];
}

const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_NAME = new RegExp(`^(?=.{1,253}$)${HOST_LABEL}(?:\\.${HOST_LABEL})*$`);

export function tunnelHostProblem(host: unknown): string | undefined {
  if (typeof host !== 'string' || host.trim() === '') return 'needs "host", the host name of your tunnel (for example my-tunnel.example.com)';
  if (HOST_NAME.test(host.trim().toLowerCase())) return undefined;
  return `"host" must be a host name only, without https://, port or path (for example my-tunnel.example.com), got "${host}"`;
}

export function resolveTunnel(config: Configuration): ResolvedTunnel {
  const plugins = config.plugins ?? [];
  const [tunnel, ...extraTunnels] = plugins.filter(isTunnelServePlugin);
  if (tunnel === undefined) return { config, host: undefined, warnings: [] };
  const warnings = extraTunnels.length > 0 ? ['several TunnelServePlugin instances, using the first one'] : [];
  const withoutTunnels = { ...config, plugins: plugins.filter((plugin) => !isTunnelServePlugin(plugin)) };
  const problem = tunnelHostProblem(tunnel.options.host);
  if (problem !== undefined) return { config: withoutTunnels, host: undefined, warnings: [...warnings, `TunnelServePlugin ${problem}; tunnel mode is off`] };
  return { config: withoutTunnels, host: tunnel.options.host.trim().toLowerCase(), warnings };
}
