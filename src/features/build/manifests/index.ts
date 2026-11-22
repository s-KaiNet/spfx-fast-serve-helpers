import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  decodedRequestPath,
  DIST_PATH,
  isReadRequest,
  MANIFESTS_PATH,
  publicPath,
  requestPath,
  send,
  type BuildContext,
  type ConfigContribution,
  type Feature,
  type FeatureContext,
  type ServerMiddleware,
} from '../../../bundler/featureApi/index.js';
import { BundleExternals } from './bundleExternals.js';
import { buildDebugManifests, renderManifestsModule } from './debugManifests.js';
import { devIconFiles } from './iconUrls.js';
import { withResolvedPropertiesSchemas, type ReferenceResolution } from './manifestReferences.js';
import { ModuleEvaluator } from './moduleExports.js';
import { bundleScriptResources } from './scriptResources.js';
import type { SpfxBundle } from '../../../project/index.js';

export { buildDebugManifests, renderManifestsModule, type DebugManifest, type ScriptResource } from './debugManifests.js';
export { BundleExternals, externalRequestsByEntry } from './bundleExternals.js';
export { devIconFiles } from './iconUrls.js';
export { bundleScriptResources, COMPONENT_LOADER_PACKAGE } from './scriptResources.js';

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

export async function renderDebugManifests(context: BuildContext, externals: BundleExternals, references: ReferenceResolution, pageScripts = ''): Promise<string> {
  const { root, project, options } = context;
  const libraries = project.libraries();
  const configExternals = project.configExternals();
  const manifests = buildDebugManifests({
    root,
    bundles: await withResolvedReferences(project.bundles(), references),
    origin: options.origin,
    bundleBaseUrl: publicPath(options.origin),
    bundleScriptPath,
    scriptResources: (bundleName) => bundleScriptResources(externals.requestsOf(bundleName), libraries, configExternals),
  });
  return pageScripts + renderManifestsModule(manifests);
}

function withResolvedReferences(bundles: readonly SpfxBundle[], references: ReferenceResolution): Promise<SpfxBundle[]> {
  return Promise.all(
    bundles.map(async (bundle) => ({
      ...bundle,
      components: await Promise.all(bundle.components.map(async (component) => ({ ...component, manifest: await withResolvedPropertiesSchemas(component, references) }))),
    })),
  );
}

export function referenceResolution({ root, logger }: Pick<BuildContext, 'root' | 'logger'>): ReferenceResolution & { readonly flushWarnings: () => void } {
  const evaluator = new ModuleEvaluator(root);
  let printed = new Set<string>();
  let current = new Set<string>();
  return {
    root,
    exportsOf: (file) => evaluator.exportsOf(file),
    warn: (message) => {
      current.add(message);
    },
    flushWarnings: () => {
      for (const message of current) if (!printed.has(message)) logger.warn(message);
      printed = current;
      current = new Set();
    },
  };
}

export const manifestsFeature: Feature = { name: 'manifests', contribute: manifestsContribution };

function manifestsContribution(context: FeatureContext): ConfigContribution {
  const externals = new BundleExternals(() => {
    context.page.reloadPages();
  });
  return {
    plugins: [externals],
    middlewares: [manifestsMiddleware(context, externals, referenceResolution(context)), iconsMiddleware(context)],
  };
}

function manifestsMiddleware(context: FeatureContext, externals: BundleExternals, references: ReturnType<typeof referenceResolution>): ServerMiddleware {
  return {
    name: 'fast-serve:manifests',
    middleware: async (req, res, next) => {
      if (!isReadRequest(req) || requestPath(req) !== MANIFESTS_PATH) {
        next();
        return;
      }
      try {
        await externals.whenCompiled();
        const body = await renderDebugManifests(context, externals, references, context.page.pageScripts());
        references.flushWarnings();
        send(req, res, 'application/javascript; charset=utf-8', body);
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
