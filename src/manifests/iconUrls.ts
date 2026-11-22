import path from 'node:path';
import type { ComponentManifest, SpfxComponent } from '../project/index.js';
import { isObject } from '../shared/guards.js';
import { toRootUrl } from '../shared/paths.js';

const RELATIVE_FILE_PATH = /^\.{1,2}\/.+/;

export interface IconUrlContext {
  root: string;
  origin: string;
  manifestFile: string;
}

export function withDevIconUrls(manifest: ComponentManifest, context: IconUrlContext): ComponentManifest {
  const { preconfiguredEntries, items } = manifest;
  return {
    ...manifest,
    ...(Array.isArray(preconfiguredEntries) ? { preconfiguredEntries: preconfiguredEntries.map((entry) => withDevIconUrl(entry, context)) } : {}),
    ...(isObject(items)
      ? { items: Object.fromEntries(Object.entries(items).map(([itemId, item]) => [itemId, withDevIconUrl(item, context)])) }
      : {}),
  };
}

export function devIconFiles(root: string, components: readonly SpfxComponent[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const { manifest, manifestFile } of components) {
    const { preconfiguredEntries, items } = manifest;
    const entries: unknown[] = [...(Array.isArray(preconfiguredEntries) ? (preconfiguredEntries as unknown[]) : []), ...(isObject(items) ? Object.values(items) : [])];
    for (const entry of entries) {
      const iconFile = relativeIconFile(entry, manifestFile);
      if (iconFile !== undefined) files.set(toRootUrl(root, iconFile), iconFile);
    }
  }
  return files;
}

function relativeIconFile(entry: unknown, manifestFile: string): string | undefined {
  if (!isObject(entry) || typeof entry.iconImageUrl !== 'string' || !RELATIVE_FILE_PATH.test(entry.iconImageUrl)) return undefined;
  return path.resolve(path.dirname(manifestFile), entry.iconImageUrl);
}

function withDevIconUrl(entry: unknown, context: IconUrlContext): unknown {
  const iconFile = relativeIconFile(entry, context.manifestFile);
  if (iconFile === undefined || !isObject(entry)) return entry;
  return { ...entry, iconImageUrl: context.origin + encodeURI(toRootUrl(context.root, iconFile)) };
}
