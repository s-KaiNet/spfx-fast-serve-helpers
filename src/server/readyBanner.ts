import { aceBannerLines } from '../aces/index.js';
import { TENANT_DOMAIN_ENV, type ResolvedOptions } from '../config/options.js';
import type { SpfxComponent } from '../project/index.js';
import { debugPageUrl, debugQuery } from './debugUrl.js';

export function readyBanner(options: ResolvedOptions, components: readonly SpfxComponent[], elapsedMs: number): string[] {
  const lines = [`ready in ${elapsedMs} ms at ${options.origin}`, ...componentLines(components)];
  const { serveConfiguration } = options;
  if (serveConfiguration) lines.push(`serve configuration: ${serveConfiguration.name}`);
  if (options.pageUrl) {
    lines.push(`open: ${debugPageUrl(options.pageUrl, options.origin, serveConfiguration)}`);
  } else {
    if (options.pageUrlTemplate) lines.push(`set ${TENANT_DOMAIN_ENV} to resolve the page URL "${options.pageUrlTemplate}"`);
    lines.push(`append to your SharePoint page URL: ?${debugQuery(options.origin, serveConfiguration)}`);
  }
  lines.push(...aceBannerLines(components, options.pageUrl, debugQuery(options.origin)));
  lines.push('the debug query sticks to the browser tab: after stopping fast-serve, open the page in a new tab');
  return lines;
}

function componentLines(components: readonly SpfxComponent[]): string[] {
  const ofType = (componentType: string) => components.filter((component) => component.manifest.componentType === componentType);
  return [
    ...componentLine('web parts', ofType('WebPart'), ({ manifest }) => manifest.alias),
    ...componentLine('extensions', ofType('Extension'), ({ manifest }) => `${manifest.alias} (${manifest.extensionType ?? 'Extension'})`),
    ...componentLine('Adaptive Card Extensions', ofType('AdaptiveCardExtension'), ({ manifest }) => manifest.alias),
  ];
}

function componentLine(label: string, members: readonly SpfxComponent[], describe: (component: SpfxComponent) => string): string[] {
  return members.length > 0 ? [`${label}: ${members.map(describe).join(', ')}`] : [];
}
