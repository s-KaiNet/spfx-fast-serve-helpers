import path from 'node:path';
import type { ComponentManifest } from '../project/index.js';
import { isObject } from '../utils/guards.js';
import { toRootUrl } from '../utils/paths.js';

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

function withDevIconUrl(entry: unknown, context: IconUrlContext): unknown {
  if (!isObject(entry) || typeof entry.iconImageUrl !== 'string' || !RELATIVE_FILE_PATH.test(entry.iconImageUrl)) return entry;
  const iconFile = path.resolve(path.dirname(context.manifestFile), entry.iconImageUrl);
  return { ...entry, iconImageUrl: context.origin + encodeURI(toRootUrl(context.root, iconFile)) };
}
