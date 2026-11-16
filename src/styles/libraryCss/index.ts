import type { Plugin, Rolldown } from 'vite';
import type { ServeContext } from '../../context.js';
import { resolveLibraryCssFile } from './resolveLibraryCss.js';
import { createLibraryCssCompiler } from './spCssLoader.js';

const MODULE_PREFIX = '\0spfx-lib-css:';
const MODULE_SUFFIX = '.js';

export function libraryCssPlugin(context: ServeContext): Plugin {
  const compile = createLibraryCssCompiler({ root: context.root, warn: context.logger.warn });

  const load = async (id: string) => {
    const cssFile = cssFileOf(id);
    return cssFile === undefined ? null : { code: await compile(cssFile), moduleType: 'js' as const };
  };

  const prebundlePlugin: Rolldown.Plugin = { name: 'fast-serve:library-css-prebundle', resolveId, load };

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

async function resolveId(
  this: Rolldown.PluginContext,
  source: string,
  importer: string | undefined,
): Promise<string | Rolldown.ResolvedId | null> {
  const importerFile = importer === undefined ? undefined : cssFileOf(importer);
  if (importerFile !== undefined) {
    return source.startsWith('.') ? this.resolve(source, importerFile, { skipSelf: true }) : null;
  }
  const cssFile = resolveLibraryCssFile(source, importer);
  return cssFile === undefined ? null : MODULE_PREFIX + cssFile + MODULE_SUFFIX;
}

function cssFileOf(id: string): string | undefined {
  return id.startsWith(MODULE_PREFIX) && id.endsWith(MODULE_SUFFIX) ? id.slice(MODULE_PREFIX.length, -MODULE_SUFFIX.length) : undefined;
}
