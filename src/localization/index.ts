import path from 'node:path';
import { rspack } from '@rspack/core';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { toPosix } from '../utils/paths.js';
import { moduleLocWrapperSource, readLocFileFormat } from './locFormat.js';

export { locFileFormat, moduleLocWrapperSource, type LocFileFormat } from './locFormat.js';

const LOC_WRAPPER_FOLDER = path.join('temp', 'fast-serve', 'loc');

export function localizationContribution({ root, project, options, logger }: BuildContext): ConfigContribution {
  const alias: Record<string, string> = {};
  const virtualModules: Record<string, string> = {};
  for (const resource of project.localizedResources(options.locale).values()) {
    if (readLocFileFormat(resource.file) === 'amd') {
      alias[`${resource.name}$`] = resource.file;
      continue;
    }
    logger.warn(
      `${resource.name}: ${toPosix(path.relative(root, resource.file))} is an ES/CommonJS module. fast-serve loads it, but heft copies ` +
        'the compiled lib/ file into dist/ as is and SharePoint loads it with RequireJS, which needs ' +
        '`define([], function () { return { ... }; });`',
    );
    const wrapper = path.join(root, LOC_WRAPPER_FOLDER, `${resource.name}.js`);
    virtualModules[wrapper] = moduleLocWrapperSource(toPosix(resource.file));
    alias[`${resource.name}$`] = wrapper;
  }
  const plugins = Object.keys(virtualModules).length === 0 ? [] : [new rspack.experiments.VirtualModulesPlugin(virtualModules)];
  return { alias, plugins };
}
