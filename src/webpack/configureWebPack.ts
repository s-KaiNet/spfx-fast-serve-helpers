import * as path from 'path';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import del from 'del';
import { merge } from 'webpack-merge';
import { Manifest, ModulesMap, SPFxConfig } from '../common/types';
import { DynamicLibraryPlugin } from '../plugins/DynamicLibraryPlugin';
import { addCopyLocalExternals, addCopyLocalizedResources, checkVersions, createLocalExternals, getEntryPoints, getJSONFile } from './helpers';

import { createBaseConfig } from './baseConfig';
import { Settings } from '../common/settings';
import { applyServeSettings } from '../settings';

const rootFolder = path.resolve(process.cwd());
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transformConfig, webpackConfig }: { transformConfig: (config: webpack.Configuration, webpack: any) => webpack.Configuration; webpackConfig: webpack.Configuration } = require(path.join(rootFolder, 'fast-serve/webpack.extend'));

const createConfig = async function () {
  checkVersions();

  const settings = getJSONFile<Settings>('fast-serve/config.json');
  const baseConfig = await createBaseConfig(settings.cli);

  del.sync(['dist/*.js', 'dist/*.map'], { cwd: rootFolder });

  // we need only "externals", "output" and "entry" from the original webpack config
  const originalWebpackConfig = getJSONFile<webpack.Configuration>('temp/_webpack_config.json');
  baseConfig.externals = originalWebpackConfig.externals;
  baseConfig.output = originalWebpackConfig.output;

  baseConfig.entry = getEntryPoints(originalWebpackConfig.entry as webpack.Entry);

  baseConfig.output.publicPath = `https://${baseConfig.devServer.host}:${baseConfig.devServer.port}/dist/`;

  const manifest = getJSONFile<Manifest[]>('temp/manifests.json');
  const { localizedResources, externals } = getJSONFile<SPFxConfig>('config/config.json');

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

  if (patterns && patterns.length > 0) {
    baseConfig.plugins.push(new CopyPlugin({
      patterns
    }));
  }

  applyServeSettings(baseConfig);

  const localExternals = createLocalExternals(externals);
  const localExternalsPatterns = addCopyLocalExternals(localExternals, manifest, originalEntries);

  if (localExternalsPatterns && localExternalsPatterns.length > 0) {
    baseConfig.plugins.push(new CopyPlugin({
      patterns: localExternalsPatterns
    }));
  }

  return baseConfig;
}

export const resultConfig = async (): Promise<webpack.Configuration> => merge(transformConfig(await createConfig(), webpack), webpackConfig);
