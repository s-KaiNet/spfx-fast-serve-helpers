import path from 'node:path';
import { TENANT_DOMAIN_ENV } from '../config/options.js';
import { packageName, packageVersion } from '../packageInfo.js';
import type { SpfxComponent, SpfxProject } from '../project/index.js';
import { toPosix } from '../utils/paths.js';
import type { ServeSetup } from './prepareServe.js';

export function describeSetup({ spfxVersion, project, options }: ServeSetup): string[] {
  return [
    `${packageName} ${packageVersion}, SPFx ${spfxVersion.version}`,
    `port ${options.port} (${options.origin}), locale ${options.locale}, overlay ${options.overlay ? 'on' : 'off'}`,
    `serve configuration: ${options.serveConfiguration?.name ?? 'none'}`,
    `page: ${describePage(options.pageUrl, options.pageUrlTemplate)}`,
    ...project.bundles().map((bundle) => `bundle ${bundle.name}: ${bundle.components.map(describeComponent).join(', ')}`),
    ...localLibraryLines(project),
    `SPFx libraries: ${project.libraries().size}, config.json externals: ${project.configExternals().size}, localized resources: ${project.localizedResources(options.locale).size}`,
  ];
}

function describePage(pageUrl: string | undefined, template: string | undefined): string {
  if (pageUrl !== undefined) return pageUrl;
  if (template !== undefined) return `${template} (set ${TENANT_DOMAIN_ENV} to fill in {tenantDomain})`;
  return 'none (set --page-url, "pageUrl" in fast-serve/config.json or "initialPage" in config/serve.json)';
}

function describeComponent({ manifest, exportName }: SpfxComponent): string {
  const kind = manifest.extensionType ?? manifest.componentType;
  return `${manifest.alias} (${kind}${exportName === undefined ? '' : `, export ${exportName}`})`;
}

function localLibraryLines(project: SpfxProject): string[] {
  const libraries = project.localLibraries();
  if (libraries.length === 0) return [];
  const described = libraries.map(({ packageName: name, root }) => `${name} (${toPosix(path.relative(project.root, root))})`);
  return [`SPFx libraries from source: ${described.join(', ')}`];
}
