import * as path from 'path';
import webpack, { Entry } from 'webpack';

import { ResourceData } from '../common/types';
import { createResourcesMap, getJSONFile } from '../webpack/helpers';

export class TypeScriptResourcesPlugin {
  private resourcesMap: Record<string, ResourceData>;
  private entryName = 'ts-resources'

  constructor() {
    const config = getJSONFile('config/config.json');
    this.resourcesMap = createResourcesMap(config.localizedResources);
  }

  public apply(compiler: webpack.Compiler) {
    const allKeys = Object.keys(this.resourcesMap);

    if (!allKeys?.length) {
      return;
    }

    (compiler.options.entry as Entry)[this.entryName] = path.resolve(__dirname, '../loaders', 'TypeScriptResourcesEntryLoader!');

    const tsLoader = (compiler.options.module as any).rules[0].use[0];

    compiler.options.module.rules[0].use = [
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