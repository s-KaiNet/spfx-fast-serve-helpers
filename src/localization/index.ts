import path from 'node:path';
import { rspack } from '@rspack/core';
import type { LocalizedResource } from '../project/index.js';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { toPosix } from '../utils/paths.js';
import { moduleLocWrapperSource, readLocFileFormat } from './locFormat.js';

export { locFileFormat, moduleLocWrapperSource, type LocFileFormat } from './locFormat.js';

const LOC_WRAPPER_FOLDER = path.join('temp', 'fast-serve', 'loc');

interface ResourceOwner {
  label: string;
  root: string;
  resources: Iterable<LocalizedResource>;
}

export function localizationContribution({ root, project, options, logger }: BuildContext): ConfigContribution {
  const alias: Record<string, string> = {};
  const virtualModules: Record<string, string> = {};
  const owners = new Map<string, string>();
  const sources: ResourceOwner[] = [
    { label: 'the project', root, resources: project.localizedResources(options.locale).values() },
    ...project.localLibraries().map((library) => ({ label: library.packageName, root: library.root, resources: library.project.localizedResources(options.locale).values() })),
  ];
  for (const source of sources) {
    for (const resource of source.resources) {
      const owner = owners.get(resource.name);
      if (owner !== undefined) {
        logger.warn(`${resource.name}: localized resources with this name come from ${owner} and ${source.label}, using the ones from ${owner}`);
        continue;
      }
      owners.set(resource.name, source.label);
      alias[`${resource.name}$`] = locModule(resource, source.root);
    }
  }

  function locModule(resource: LocalizedResource, resourceRoot: string): string {
    if (readLocFileFormat(resource.file) === 'amd') return resource.file;
    logger.warn(
      `${resource.name}: ${toPosix(path.relative(resourceRoot, resource.file))} is an ES/CommonJS module. fast-serve loads it, but heft copies ` +
        'the compiled lib/ file into dist/ as is and SharePoint loads it with RequireJS, which needs ' +
        '`define([], function () { return { ... }; });`',
    );
    const wrapper = path.join(root, LOC_WRAPPER_FOLDER, `${resource.name}.js`);
    virtualModules[wrapper] = moduleLocWrapperSource(toPosix(resource.file));
    return wrapper;
  }

  const plugins = Object.keys(virtualModules).length === 0 ? [] : [new rspack.experiments.VirtualModulesPlugin(virtualModules)];
  return { alias, plugins };
}
