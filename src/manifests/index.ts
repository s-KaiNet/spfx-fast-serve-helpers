import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DIST_PATH, publicPathOf, type BuildContext } from '../rspack/context.js';
import type { ConfigContribution, PageReloader, ServerMiddleware } from '../rspack/contribution.js';
import { decodedRequestPath, isReadRequest, requestPath, send } from '../utils/http.js';
import { BundleExternals } from './bundleExternals.js';
import { buildDebugManifests, renderManifestsModule } from './debugManifests.js';
import { devIconFiles } from './iconUrls.js';
import { bundleScriptResources } from './scriptResources.js';

export { buildDebugManifests, renderManifestsModule, type DebugManifest, type ScriptResource } from './debugManifests.js';
export { BundleExternals, externalRequestsByEntry } from './bundleExternals.js';
export { devIconFiles } from './iconUrls.js';
export { bundleScriptResources, COMPONENT_LOADER_PACKAGE } from './scriptResources.js';

export const MANIFESTS_PATH = '/temp/build/manifests.js';

const ICON_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

export function bundleScriptPath(bundleName: string): string {
  return `${bundleName}.js`;
}

export function renderDebugManifests(context: BuildContext, externals: BundleExternals): string {
  const { root, project, options } = context;
  const libraries = project.libraries();
  const configExternals = project.configExternals();
  const manifests = buildDebugManifests({
    root,
    bundles: project.bundles(),
    origin: options.origin,
    bundleBaseUrl: publicPathOf(context),
    bundleScriptPath,
    scriptResources: (bundleName) => bundleScriptResources(externals.requestsOf(bundleName), libraries, configExternals),
  });
  return renderManifestsModule(manifests);
}

export function manifestsContribution(context: BuildContext): ConfigContribution {
  const reloaders: PageReloader[] = [];
  const externals = new BundleExternals(() => {
    for (const reloader of reloaders) reloader.reloadPages();
  });
  return {
    plugins: [externals],
    middlewares: [manifestsMiddleware(context, externals), iconsMiddleware(context)],
    serverStarted: [
      (reloader) => {
        reloaders.push(reloader);
      },
    ],
  };
}

function manifestsMiddleware(context: BuildContext, externals: BundleExternals): ServerMiddleware {
  return {
    name: 'fast-serve:manifests',
    middleware: async (req, res, next) => {
      if (!isReadRequest(req) || requestPath(req) !== MANIFESTS_PATH) {
        next();
        return;
      }
      try {
        await externals.whenCompiled();
        send(req, res, 'application/javascript; charset=utf-8', renderDebugManifests(context, externals));
      } catch (error) {
        next(error);
      }
    },
  };
}

function iconsMiddleware({ root, project }: BuildContext): ServerMiddleware {
  return {
    name: 'fast-serve:manifest-icons',
    middleware: async (req, res, next) => {
      const urlPath = isReadRequest(req) ? decodedRequestPath(req) : undefined;
      if (urlPath === undefined || urlPath.startsWith(DIST_PATH)) {
        next();
        return;
      }
      const iconFile = devIconFiles(root, project.components()).get(urlPath);
      const contentType = iconFile === undefined ? undefined : ICON_CONTENT_TYPES[path.extname(iconFile).toLowerCase()];
      if (iconFile === undefined || contentType === undefined) {
        next();
        return;
      }
      try {
        send(req, res, contentType, await readFile(iconFile));
      } catch (error) {
        next(error);
      }
    },
  };
}
