import globby from 'globby';
import * as path from 'path';
import webpack, { Entry } from 'webpack';
import InjectPlugin from 'webpack-inject-plugin';

import { LocalizedResources } from '../common/types';
import { createKeyFromPath, getJSONFile, trimLeft } from '../webpack/helpers';

export type ResourceData = {
  path: string;
  fileName: string;
}

export class TypeScriptResourcesPlugin {
  private resourcesMap: Record<string, ResourceData> = {};
  private entryName = 'ts-resources'

  constructor() {
    const config = getJSONFile('config/config.json');
    const localizedResources: LocalizedResources = config.localizedResources;

    for (const resourceKey in localizedResources) {
      const resourcePath = localizedResources[resourceKey];
      const search = resourcePath.replace(/^lib/gi, 'src').replace('{locale}.js', '*.ts');
      const exclude = '!' + search.replace('*.ts', '*.d.ts');
      const typescriptResources = globby.sync([search, exclude], {
        cwd: process.cwd()
      });

      if (!typescriptResources?.length) {
        continue;
      }

      for (const resourcePath of typescriptResources) {
        const key = createKeyFromPath(resourcePath);
        const fileName = `${resourceKey}_${path.basename(resourcePath).replace('.ts', '.js')}`;
        this.resourcesMap[key] = {
          path: trimLeft(resourcePath, '/\\\\'),
          fileName
        }
      }
    }
  }

  public apply(compiler: webpack.Compiler) {
    const allKeys = Object.keys(this.resourcesMap);

    if (!allKeys?.length) {
      return;
    }

    (compiler.options.entry as Entry)[this.entryName] = './src/index';

    const tsLoader = (compiler.options.module as any).rules[0].use[0];

    compiler.options.module.rules[0].use = [
      {
        loader: require.resolve('./TypeScriptResourcesLoader'),
        options: this.resourcesMap
      },
      {
        ...tsLoader
      }
    ]

    new InjectPlugin(this.createInjectFunction(), {
      entryName: this.entryName
    }).apply(compiler);
  }

  private createInjectFunction() {
    const template = 'require("###");';
    return () => {
      let result = '';
      for (const key in this.resourcesMap) {
        const map = this.resourcesMap[key];
        result += template.replace('###', './' + map.path);
      }

      return result;
    }
  }
}