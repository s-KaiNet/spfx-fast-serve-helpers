import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import type { SpfxBundle } from '../project/index.js';
import { sendJavaScript } from '../utils/vite.js';
import { buildDebugManifests, renderManifestsModule, type ScriptResource } from './debugManifests.js';

export { buildDebugManifests, renderManifestsModule, type DebugManifest, type ScriptResource } from './debugManifests.js';

export const MANIFESTS_PATH = '/temp/build/manifests.js';

export interface ManifestsPluginOptions {
  bundles: () => SpfxBundle[];
  bundleScriptPath: (bundleName: string) => string;

  scriptResources: () => Record<string, ScriptResource>;
}

export function manifestsPlugin(context: ServeContext, options: ManifestsPluginOptions): Plugin {
  return {
    name: 'fast-serve:manifests',
    configureServer(server) {
      server.middlewares.use(MANIFESTS_PATH, (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        try {
          const manifests = buildDebugManifests({
            bundles: options.bundles(),
            origin: context.options.origin,
            bundleScriptPath: options.bundleScriptPath,
            scriptResources: options.scriptResources(),
          });
          sendJavaScript(res, renderManifestsModule(manifests));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
