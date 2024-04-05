import * as path from 'path';
import webpack, { EntryObject, RuleSetRule } from 'webpack';

import { ResourceData, SPFxConfig } from '../common/types';
import { createResourcesMap, getJSONFile } from '../common/helpers';

export class TypeScriptResourcesPlugin {
  private resourcesMap: Record<string, ResourceData>;
  private entryName = 'ts-resources'

  constructor() {
    const config = getJSONFile<SPFxConfig>('config/config.json');
    this.resourcesMap = createResourcesMap(config.localizedResources);
  }

  public apply(compiler: webpack.Compiler) {
    const allKeys = Object.keys(this.resourcesMap);

    if (!allKeys?.length) {
      return;
    }

    // TODO - should it be EntryObject as key value or another object?
    (compiler.options.entry as EntryObject)[this.entryName] = path.resolve(__dirname, '../loaders', 'TypeScriptResourcesEntryLoader!');

    const tsLoader = (compiler.options.module as any).rules[0].use[0];

    (compiler.options.module.rules[0] as RuleSetRule).use = [
      {
        loader: require.resolve('../loaders/TypeScriptResourcesLoader'),
        options: this.resourcesMap
      },
      {
        ...tsLoader
      }
    ]
  }
}
