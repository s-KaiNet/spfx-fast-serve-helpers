import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import { tsconfigPathsPlugin } from './aliases/index.js';
import { assetTypingsPlugin } from './assets/index.js';
import type { ServeContext } from './context.js';
import { createExternals } from './externals/index.js';
import { bundleEntryPath, bundleShimPath, loaderPlugin } from './loader/index.js';
import { localizationPlugin } from './localization/index.js';
import { manifestsPlugin } from './manifests/index.js';
import type { HttpsCredentials } from './server/certificate.js';
import { createStartupWarmup, serverPlugin } from './server/index.js';
import { libraryCssPlugin, scssTypingsPlugin, stylesPlugin } from './styles/index.js';
import { transformPlugins } from './transforms/index.js';

export function fastServePlugins(context: ServeContext, https: HttpsCredentials): PluginOption[] {
  const externals = createExternals(context);
  const bundles = () => context.project.bundles();
  const warmup = createStartupWarmup();

  return [
    serverPlugin(context, https, { warmup, warmupUrls: () => bundles().map((bundle) => bundleEntryPath(bundle.name)) }),
    manifestsPlugin(context, {
      bundles,
      bundleScriptPath: bundleShimPath,
      scriptResources: () => externals.manifestScriptResources(),
    }),
    loaderPlugin(context, { bundles, shimPrelude: () => externals.shimPrelude() }),
    externals.plugin,
    tsconfigPathsPlugin(context),
    localizationPlugin(context),
    libraryCssPlugin(context),
    stylesPlugin(),
    scssTypingsPlugin(context, { after: warmup.done }),
    assetTypingsPlugin(context),
    ...transformPlugins(context),
    react(),
  ];
}
