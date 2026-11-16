import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { sendJavaScript } from '../utils/vite.js';
import { renderBundleEntry } from './entry.js';
import { parseBundleEntryPath, parseBundleShimPath } from './paths.js';
import { createShimConfig, renderShim } from './shim.js';
import type { SpfxBundle } from '../project/index.js';

export { bundleShimPath } from './paths.js';
export { createServedBundles } from './servedBundles.js';

export interface LoaderPluginOptions {
  bundles: () => SpfxBundle[];
  shimPrelude: () => Promise<string>;
}

const VIRTUAL_ENTRY_PREFIX = '\0spfx-entry:';

export function loaderPlugin(context: ServeContext, options: LoaderPluginOptions): Plugin {
  const { root } = context;
  const findBundle = (name: string) => options.bundles().find((bundle) => bundle.name === name);

  return {
    name: 'fast-serve:loader',
    enforce: 'pre',

    config: () => ({
      optimizeDeps: {
        entries: options.bundles().flatMap((bundle) => bundle.components.map((component) => component.entryFile)),
        include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime'],
      },
    }),

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const bundleName = parseBundleShimPath((req.url ?? '').split('?')[0] ?? '');
        const bundle = bundleName === undefined ? undefined : findBundle(bundleName);
        if (!bundle) {
          next();
          return;
        }
        options
          .shimPrelude()
          .then((prelude) => renderShim(createShimConfig(bundle, context.options.origin), prelude))
          .then((code) => {
            sendJavaScript(res, code);
          }, next);
      });
    },

    resolveId(source) {
      const bundleName = parseBundleEntryPath(source);
      return bundleName === undefined ? null : VIRTUAL_ENTRY_PREFIX + bundleName;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_ENTRY_PREFIX)) return null;
      const bundle = findBundle(id.slice(VIRTUAL_ENTRY_PREFIX.length));
      return bundle ? renderBundleEntry(root, bundle) : null;
    },
  };
}
