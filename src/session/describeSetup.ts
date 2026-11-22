import path from 'node:path';
import { TENANT_DOMAIN_ENV } from '../config/index.js';
import { packageName, packageVersion } from '../shared/packageInfo.js';
import type { SpfxComponent, SpfxProject } from '../project/index.js';
import { toPosix } from '../shared/paths.js';
import type { ServeSetup } from './prepareServe.js';

export function versionLine({ spfxVersion }: Pick<ServeSetup, 'spfxVersion'>): string {
  return `${packageName} ${packageVersion}, SPFx ${spfxVersion.version}`;
}

export function setupDetails({ project, options }: ServeSetup): string[] {
  return [
    `port ${options.port} (${options.origin}), locale ${options.locale}, overlay ${options.overlay ? 'on' : 'off'}, type check ${describeTypeCheck(options)}, lint ${describeLint(options.lint)}`,
    `serve configuration: ${options.serveConfiguration?.name ?? 'none'}`,
    `page: ${describePage(options.pageUrl, options.pageUrlTemplate)}`,
    ...project.bundles().map((bundle) => `bundle ${bundle.name}: ${bundle.components.map(describeComponent).join(', ')}`),
    ...localLibraryLines(project),
    `SPFx libraries: ${project.libraries().size}, config.json externals: ${project.configExternals().size}, localized resources: ${project.localizedResources(options.locale).size}`,
  ];
}

function describeTypeCheck({ typeCheck }: ServeSetup['options']): string {
  return typeCheck ? 'on' : 'off';
}

function describeLint(lint: ServeSetup['options']['lint']): string {
  if (lint === 'full') return 'on (full, with type-aware rules)';
  return lint ? 'on' : 'off';
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
  const libraries = project.codeRoots().filter((codeRoot) => codeRoot.project.role === 'library');
  if (libraries.length === 0) return [];
  const described = libraries.map(({ label, root }) => `${label} (${toPosix(path.relative(project.root, root))})`);
  return [`SPFx libraries from source: ${described.join(', ')}`];
}
