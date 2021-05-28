import * as path from 'path';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import del from 'del';
import { merge } from 'webpack-merge';
import { Manifest, ModulesMap, SPFxConfig } from '../common/types';
import { DynamicLibraryPlugin } from '../plugins/DynamicLibraryPlugin';
import { addCopyLocalizedResources, getEntryPoints, getJSONFile } from './helpers';

import { createBaseConfig } from './baseConfig';
import { Settings } from '../common/settings';
import { applyServeSettings } from '../settings';

const rootFolder = path.resolve(process.cwd());
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transformConfig, webpackConfig } = require(path.join(rootFolder, 'fast-serve/webpack.extend'));

const settings = getJSONFile<Settings>('fast-serve/config.json');

const baseConfig = createBaseConfig(settings.cli.isLibraryComponent);

const createConfig = function () {
  del.sync(['dist/*.js', 'dist/*.map'], { cwd: rootFolder });

  // we need only "externals", "output" and "entry" from the original webpack config
  const originalWebpackConfig = getJSONFile<webpack.Configuration>('temp/_webpack_config.json');
  baseConfig.externals = originalWebpackConfig.externals;
  baseConfig.output = originalWebpackConfig.output;

  baseConfig.entry = getEntryPoints(originalWebpackConfig.entry as webpack.Entry);

  baseConfig.output.publicPath = `https://${baseConfig.devServer.host}:${baseConfig.devServer.port}/dist/`;

  const manifest = getJSONFile<Manifest[]>('temp/manifests.json');
  const { localizedResources } = getJSONFile<SPFxConfig>('config/config.json');

  const modulesMap: ModulesMap = {};
  const originalEntries = Object.keys(originalWebpackConfig.entry);

  for (const jsModule of manifest) {
    if (jsModule.loaderConfig
      && jsModule.loaderConfig.entryModuleId
      && originalEntries.indexOf(jsModule.loaderConfig.entryModuleId) !== -1) {
      const entryModuleId = jsModule.loaderConfig.entryModuleId;
      modulesMap[entryModuleId + '.js'] = {
        id: jsModule.id,
        version: jsModule.version,
        path: jsModule.loaderConfig.scriptResources[entryModuleId].path
      }
    }
  }

  baseConfig.output.filename = function (pathInfo) {
    const entryPointName = pathInfo.chunk.name + '.js';
    if (!modulesMap[entryPointName]) {
      return '[name].js';
    }
    return modulesMap[entryPointName].path;
  };

  baseConfig.plugins.push(new DynamicLibraryPlugin({
    modulesMap: modulesMap,
    libraryName: originalWebpackConfig.output.library as string
  }));

  const patterns = addCopyLocalizedResources(localizedResources);

  baseConfig.plugins.push(new CopyPlugin({
    patterns
  }));

  applyServeSettings(baseConfig);

  return baseConfig;
}

export const resultConfig = merge<webpack.Configuration>(transformConfig(createConfig()), webpackConfig);
