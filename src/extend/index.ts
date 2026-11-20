import { rspackVersion } from '@rspack/core';
import type { ResolvedOptions } from '../config/index.js';
import { publicPath } from '../featureApi/index.js';
import { packageVersion } from '../packageInfo.js';
import type { SpfxVersionSource } from '../project/index.js';
import type { FastServeContext } from './context.js';

export { FAST_SERVE_ENV, type FastServeConfig, type FastServeConfigFunction, type FastServeContext, type FastServeEnv } from './context.js';
export { EXTEND_FILE, extendFileCandidates, findExtendFile, findExtendFiles, projectRelative } from './files.js';
export { guardExtendConfig, type GuardedExtend, type IgnoredKey } from './guard.js';
export { ExtendLoadError, loadExtendFile, type LoadedExtend } from './load.js';
export { mergeDevServer, mergeRspackConfig, mergeValues } from './merge.js';
export { RSPACK_CONFIG_DOCS_URL, SKILL_PATH, webpackCustomizationHint } from './webpackHint.js';

export function fastServeContext(root: string, options: ResolvedOptions, spfxVersion: SpfxVersionSource): FastServeContext {
  return Object.freeze({
    root,
    port: options.port,
    origin: options.origin,
    publicPath: publicPath(options.origin),
    locale: options.locale,
    serveConfiguration: options.serveConfiguration?.name,
    pageUrl: options.pageUrl,
    spfxVersion: spfxVersionOf(spfxVersion),
    fastServeVersion: packageVersion,
    rspackVersion,
  });
}

function spfxVersionOf(source: SpfxVersionSource): string {
  if (source.kind === 'installed') return source.version;
  if (source.kind === 'declared') return source.range;
  return 'unknown';
}
