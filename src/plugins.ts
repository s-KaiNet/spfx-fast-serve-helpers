import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import type { ServeContext } from './context.js';
import { createExternals } from './externals/index.js';
import { bundleShimPath, loaderPlugin } from './loader/index.js';
import { localizationPlugin } from './localization/index.js';
import { manifestsPlugin } from './manifests/index.js';
import type { HttpsCredentials } from './server/certificate.js';
import { serverPlugin } from './server/index.js';
import { libraryCssPlugin, scssTypingsPlugin, stylesPlugin } from './styles/index.js';
import { transformPlugins } from './transforms/index.js';

export function fastServePlugins(context: ServeContext, https: HttpsCredentials): PluginOption[] {
  const externals = createExternals(context);
  const bundles = () => context.project.bundles();

  return [
    serverPlugin(context, https),
    manifestsPlugin(context, {
      bundles,
      bundleScriptPath: bundleShimPath,
      scriptResources: () => externals.manifestScriptResources(),
    }),
    loaderPlugin(context, { bundles, shimPrelude: () => externals.shimPrelude() }),
    externals.plugin,
    localizationPlugin(context),
    libraryCssPlugin(context),
    stylesPlugin(),
    scssTypingsPlugin(context),
    ...transformPlugins(context),
    react(),
  ];
}
