import path from 'node:path';
import type { Plugin, Rolldown } from 'vite';
import type { ServeContext } from '../../context.js';
import { resolveLibraryCssFile } from './resolveLibraryCss.js';
import { createLibraryCssCompiler } from './spCssLoader.js';
import { toPosix } from '../../utils/paths.js';

const MODULE_PREFIX = '\0spfx-lib-css:';
const MODULE_SUFFIX = '.js';
const MODULE_ID_FILTER = /spfx-lib-css:.*\.js$/;
const STYLE_SPECIFIER_FILTER = /\.(?:scss|sass|css)(?:\?.*)?$/;
const RELATIVE_IMPORT_SPECIFIER = /(\bfrom\s*)"(\.\.?\/[^"]*)"/g;

export function libraryCssPlugin(context: ServeContext): Plugin {
  const compile = createLibraryCssCompiler({ root: context.root, warn: context.logger.warn });

  const load = async (id: string) => {
    const cssFile = cssFileOf(id);
    return cssFile === undefined ? null : { code: withAbsoluteImports(await compile(cssFile), cssFile), moduleType: 'js' as const };
  };

  const prebundlePlugin: Rolldown.Plugin = {
    name: 'fast-serve:library-css-prebundle',
    resolveId: { filter: { id: STYLE_SPECIFIER_FILTER }, handler: resolveId },
    load: { filter: { id: MODULE_ID_FILTER }, handler: load },
  };

  return {
    name: 'fast-serve:library-css',
    enforce: 'pre',
    config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [prebundlePlugin] } } }),
    resolveId,
    async load(id) {
      const cssFile = cssFileOf(id);
      if (cssFile !== undefined) this.addWatchFile(cssFile);
      return load(id);
    },
  };
}

function resolveId(source: string, importer: string | undefined): string | null {
  const cssFile = resolveLibraryCssFile(source, importer);
  return cssFile === undefined ? null : MODULE_PREFIX + cssFile + MODULE_SUFFIX;
}

function withAbsoluteImports(code: string, cssFile: string): string {
  const directory = path.dirname(cssFile);
  return code.replaceAll(RELATIVE_IMPORT_SPECIFIER, (_match, keyword: string, specifier: string) => {
    return `${keyword}${JSON.stringify(toPosix(path.resolve(directory, specifier)))}`;
  });
}

function cssFileOf(id: string): string | undefined {
  return id.startsWith(MODULE_PREFIX) && id.endsWith(MODULE_SUFFIX) ? id.slice(MODULE_PREFIX.length, -MODULE_SUFFIX.length) : undefined;
}
