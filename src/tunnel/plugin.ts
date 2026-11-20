import type { RspackPluginInstance } from '@rspack/core';

export interface TunnelServeOptions {
  host: string;
}

export const TUNNEL_SERVE_PLUGIN: unique symbol = Symbol.for('spfx-fast-serve.tunnel-serve-plugin');

export class TunnelServePlugin implements RspackPluginInstance {
  readonly [TUNNEL_SERVE_PLUGIN] = true;
  readonly options: TunnelServeOptions;

  constructor(options: TunnelServeOptions) {
    this.options = { ...options };
  }

  apply(): void {
    return undefined;
  }
}

export function isTunnelServePlugin(value: unknown): value is TunnelServePlugin {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[TUNNEL_SERVE_PLUGIN] === true;
}
