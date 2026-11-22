import path from 'node:path';
import { rspack } from '@rspack/core';
import type { LocalizedResource } from '../../../project/index.js';
import type { ConfigContribution, Feature, FeatureContext } from '../../../bundler/featureApi/index.js';
import { toPosix } from '../../../shared/paths.js';
import { heftStringsMiddleware } from './heftStrings.js';
import { moduleLocWrapperSource, readLocFileFormat } from './locFormat.js';

export { evaluateStrings, heftStringsRequest, stringsModuleSource } from './heftStrings.js';
export { locFileFormat, moduleLocWrapperSource, type LocFileFormat } from './locFormat.js';

const LOC_WRAPPER_FOLDER = path.join('temp', 'fast-serve', 'loc');

export const localizationFeature: Feature = { name: 'localization', contribute: localizationContribution };

function localizationContribution(context: FeatureContext): ConfigContribution {
  const { root, project, options, logger } = context;
  const alias: Record<string, string> = {};
  const virtualModules: Record<string, string> = {};
  const owners = new Map<string, string>();
  for (const source of project.codeRoots()) {
    for (const resource of source.project.localizedResources(options.locale).values()) {
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
  return { alias, plugins, middlewares: [heftStringsMiddleware(context)] };
}
