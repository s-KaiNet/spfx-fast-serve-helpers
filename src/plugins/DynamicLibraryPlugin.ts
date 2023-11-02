import webpack from 'webpack';
import { DynamicLibraryPluginOptions } from '../common/types';

///
// Transforms define("<guid>", ...) to web part specific define("<web part id_version", ...)
// the same approach is used inside copyAssets SPFx build step
///
export class DynamicLibraryPlugin {
  constructor(private options: DynamicLibraryPluginOptions) {
  }

  apply(compiler: webpack.Compiler) {
    (compiler as any).webpack = webpack;
    compiler.hooks.emit.tap('DynamicLibraryPlugin', compilation => {
      for (const assetId in this.options.modulesMap) {
        const moduleMap = this.options.modulesMap[assetId];

        if (compilation.assets[assetId]) {
          if (compilation.assets[assetId].children) {
            const rawValue = compilation.assets[assetId].children[0]._value;

            if (moduleMap.isBundle) {
              compilation.assets[assetId].children[0]._value = rawValue.replace(`"${this.options.libraryName}",`, '');
            } else {
              compilation.assets[assetId].children[0]._value = rawValue.replace(this.options.libraryName, moduleMap.id + '_' + moduleMap.version);
            }
          }

          if (compilation.assets[assetId]._source) {
            const rawValue = compilation.assets[assetId]._source.children[0];
            if (moduleMap.isBundle) {
              compilation.assets[assetId]._source.children[0] = rawValue.replace(`"${this.options.libraryName}",`, '');
            } else {
              compilation.assets[assetId]._source.children[0] = rawValue.replace(this.options.libraryName, moduleMap.id + '_' + moduleMap.version);
            }
          }
        }
      }
    });
  }
}
