import { isObject, type JsonObject } from '../../shared/guards.js';
import { findSourceFile, LOC_EXTENSIONS } from './sourcePaths.js';
import type { LocalizedResource, ProjectLogger } from '../types.js';

export const DEFAULT_LOCALE = 'en-us';

interface ResourceLookup {
  readonly root: string;
  readonly locale: string;
  readonly logger: ProjectLogger;
}

export function readLocalizedResources(root: string, config: JsonObject, locale: string, logger: ProjectLogger): Map<string, LocalizedResource> {
  const result = new Map<string, LocalizedResource>();
  for (const [name, pattern] of Object.entries(isObject(config.localizedResources) ? config.localizedResources : {})) {
    if (typeof pattern !== 'string') continue;
    const resource = resolveLocalizedResource({ root, locale, logger }, name, pattern);
    if (resource) result.set(name, resource);
  }
  return result;
}

function resolveLocalizedResource({ root, locale, logger }: ResourceLookup, name: string, pattern: string): LocalizedResource | undefined {
  const candidates = locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE];
  for (const candidate of candidates) {
    const file = findSourceFile(root, pattern.replaceAll('{locale}', candidate), LOC_EXTENSIONS);
    if (!file) continue;
    if (candidate !== locale) logger.warn(`${name}: no "${locale}" strings, using ${candidate}`);
    return { name, file, locale: candidate };
  }
  logger.warn(`${name}: no strings file found for "${pattern}"`);
  return undefined;
}

export function findLocalizedResourceFile(root: string, config: JsonObject, name: string, locale: string): string | undefined {
  const pattern = isObject(config.localizedResources) ? config.localizedResources[name] : undefined;
  return typeof pattern === 'string' ? findSourceFile(root, pattern.replaceAll('{locale}', locale), LOC_EXTENSIONS) : undefined;
}
