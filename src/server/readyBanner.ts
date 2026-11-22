import type { ResolvedOptions } from '../config/index.js';
import { loadsExtensions, readableDebugQuery } from './debugUrl.js';

const BOX_RULE = '═'.repeat(64);
const BOX_INDENT = '  ';

export function readyBanner(options: ResolvedOptions, elapsedMs: number): string[] {
  if (options.tunnelHost !== undefined) return tunnelBanner(options, elapsedMs);
  return [`ready in ${elapsedMs} ms at ${options.origin}`, ...debugQueryBox(options)];
}

function debugQueryBox({ origin, serveConfiguration }: Pick<ResolvedOptions, 'origin' | 'serveConfiguration'>): string[] {
  const lines = ['To load your scripts, append this to your SharePoint page URL:', `?${readableDebugQuery(origin)}`];
  if (serveConfiguration?.explicit === true && loadsExtensions(serveConfiguration)) {
    lines.push(`To load the extensions of serve configuration "${serveConfiguration.name}" too, use this instead:`, `?${readableDebugQuery(origin, serveConfiguration)}`);
  }
  return [BOX_RULE, ...lines.map((line) => BOX_INDENT + line), BOX_RULE];
}

function tunnelBanner({ origin, localOrigin }: ResolvedOptions, elapsedMs: number): string[] {
  return [
    `ready in ${elapsedMs} ms at ${origin} (tunnel mode; your tunnel forwards to ${localOrigin})`,
    `tunnel mode: open your SharePoint page without the debug query; the development package in the app catalog loads the bundles from ${origin}/dist/`,
  ];
}
