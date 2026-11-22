import path from 'node:path';
import { rspack } from '@rspack/core';
import type { SpfxBundle } from '../project/index.js';
import type { ConfigContribution, Feature, FeatureContext } from '../bundler/featureApi/index.js';
import { toPosix } from '../shared/paths.js';

const VIRTUAL_ENTRY_FOLDER = path.join('temp', 'fast-serve', 'bundle-entries');

export const entriesFeature: Feature = { name: 'entries', contribute: entriesContribution };

function entriesContribution({ root, project }: FeatureContext): ConfigContribution {
  const virtualModules: Record<string, string> = {};
  const entry: Record<string, string> = {};
  for (const bundle of project.bundles()) {
    const [onlyComponent] = bundle.components;
    if (bundle.components.length === 1 && onlyComponent) {
      entry[bundle.name] = onlyComponent.entryFile;
      continue;
    }
    const entryFile = path.join(root, VIRTUAL_ENTRY_FOLDER, `${bundle.name}.js`);
    virtualModules[entryFile] = multiComponentEntrySource(bundle);
    entry[bundle.name] = entryFile;
  }
  const plugins = Object.keys(virtualModules).length === 0 ? [] : [new rspack.experiments.VirtualModulesPlugin(virtualModules)];
  return { entry, plugins };
}

export function multiComponentEntrySource(bundle: SpfxBundle): string {
  return bundle.components
    .map(({ exportName, entryFile, manifest }) => {
      if (exportName === undefined) throw new Error(`${manifest.alias} in bundle "${bundle.name}" has no export name`);
      return `export * as ${exportName} from ${JSON.stringify(toPosix(entryFile))};\n`;
    })
    .join('');
}
