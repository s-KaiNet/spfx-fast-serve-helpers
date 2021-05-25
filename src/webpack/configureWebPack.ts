import * as path from 'path';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import del from 'del';
import { merge } from 'webpack-merge';
import { LocalizedResources, ModulesMap } from '../common/types';
import { DynamicLibraryPlugin } from '../plugins/DynamicLibraryPlugin';
import { addCopyLocalizedResources, getEntryPoints, getJSONFile, setDefaultServeSettings } from './helpers';

import { createBaseConfig } from './baseConfig';

const rootFolder = path.resolve(process.cwd());
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transformConfig, webpackConfig } = require(path.join(rootFolder, 'fast-serve/webpack.extend'));

const settings = getJSONFile('fast-serve/config.json');
setDefaultServeSettings(settings);

const baseConfig = createBaseConfig(settings);

const createConfig = function () {
  del.sync(['dist/*.js', 'dist/*.map'], { cwd: rootFolder });

  // we need only "externals", "output" and "entry" from the original webpack config
  const originalWebpackConfig = getJSONFile('temp/_webpack_config.json');
  baseConfig.externals = originalWebpackConfig.externals;
  baseConfig.output = originalWebpackConfig.output;

  baseConfig.entry = getEntryPoints(originalWebpackConfig.entry);

  baseConfig.output.publicPath = `https://${baseConfig.devServer.host}:${baseConfig.devServer.port}/dist/`;

  const manifest = getJSONFile('temp/manifests.json');
  const config = getJSONFile('config/config.json');

  const localizedResources: LocalizedResources = config.localizedResources;
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
    libraryName: originalWebpackConfig.output.library
  }));

  const patterns = addCopyLocalizedResources(localizedResources);

  baseConfig.plugins.push(new CopyPlugin({
    patterns
  }));

  return baseConfig;
}

export const resultConfig = merge<webpack.Configuration>(transformConfig(createConfig()), webpackConfig);
