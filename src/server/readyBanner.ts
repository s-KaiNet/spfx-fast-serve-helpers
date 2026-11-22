import { TENANT_DOMAIN_ENV, type ResolvedOptions } from '../config/index.js';
import { loadsExtensions, readableDebugPageUrl, readableDebugQuery } from './debugUrl.js';

const BOX_RULE = '═'.repeat(64);
const BOX_INDENT = '  ';

export function readyBanner(options: ResolvedOptions, elapsedMs: number): string[] {
  if (options.tunnelHost !== undefined) return tunnelBanner(options, elapsedMs);
  return [`ready in ${elapsedMs} ms at ${options.origin}`, ...debugQueryBox(options)];
}

type BoxOptions = Pick<ResolvedOptions, 'origin' | 'serveConfiguration' | 'pageUrl' | 'pageUrlTemplate' | 'pageUrlProvided'>;

function debugQueryBox(options: BoxOptions): string[] {
  const { origin, serveConfiguration } = options;
  const extensions = serveConfiguration?.explicit === true && loadsExtensions(serveConfiguration) ? serveConfiguration : undefined;
  const lines = ['To load your scripts, append this to your SharePoint page URL:', `?${readableDebugQuery(origin)}`];
  if (extensions) lines.push(`To load the extensions of serve configuration "${extensions.name}" too, use this instead:`, `?${readableDebugQuery(origin, extensions)}`);
  lines.push(...pageLines(options, extensions));
  return [BOX_RULE, ...lines.map((line) => BOX_INDENT + line), BOX_RULE];
}

function pageLines({ origin, pageUrl, pageUrlTemplate, pageUrlProvided }: BoxOptions, extensions: BoxOptions['serveConfiguration']): string[] {
  if (!pageUrlProvided) return [];
  if (pageUrl === undefined) return [`Set ${TENANT_DOMAIN_ENV} to fill in the page URL "${pageUrlTemplate ?? ''}".`];
  return ['Or open:', readableDebugPageUrl(pageUrl, origin, extensions)];
}

function tunnelBanner({ origin, localOrigin }: ResolvedOptions, elapsedMs: number): string[] {
  return [
    `ready in ${elapsedMs} ms at ${origin} (tunnel mode; your tunnel forwards to ${localOrigin})`,
    `tunnel mode: open your SharePoint page without the debug query; the development package in the app catalog loads the bundles from ${origin}/dist/`,
  ];
}
