import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Configuration } from '@rspack/core';
import { assetsContribution } from '../assets/index.js';
import { browserErrorsFeature } from '../browserErrors/index.js';
import { definesContribution } from '../defines/index.js';
import { entriesContribution } from '../entries/index.js';
import { externalsContribution } from '../externals/index.js';
import { hmrContribution } from '../hmr/index.js';
import { localizationContribution } from '../localization/index.js';
import { manifestsContribution } from '../manifests/index.js';
import { reactContribution } from '../react/index.js';
import { stylesContribution } from '../styles/index.js';
import { typescriptContribution } from '../typescript/index.js';
import { publicPathOf, type BuildContext } from './context.js';
import { mergeContributions, type ConfigContribution, type ServerMiddleware, type ServerStartedHook } from './contribution.js';

export const OUTPUT_FOLDER = path.join('temp', 'fast-serve', 'dist');

const HEFT_RESOLVE_EXTENSIONS = ['.wasm', '.mjs', '.js', '.json', '.jsx'];
const IGNORED_PROJECT_FOLDERS = ['lib', 'lib-[^\\\\/]+', 'dist', 'temp', 'release', 'sharepoint', 'teams', 'jest-output', '\\.heft'];

export interface RspackConfigOptions {
  outputPath?: string;
}

export async function featureContributions(context: BuildContext): Promise<ConfigContribution[]> {
  const browserErrors = browserErrorsFeature(context);
  return [
    entriesContribution(context),
    typescriptContribution(context),
    externalsContribution(context),
    reactContribution(context),
    localizationContribution(context),
    assetsContribution(context),
    await stylesContribution(context),
    definesContribution(),
    manifestsContribution(context, browserErrors.pageScript),
    browserErrors.contribution,
    hmrContribution(context),
  ];
}

export interface RspackBuild {
  config: Configuration;
  middlewares: ServerMiddleware[];
  serverStarted: ServerStartedHook[];
}

export async function createRspackConfig(context: BuildContext, options: RspackConfigOptions = {}): Promise<Configuration> {
  return (await createRspackBuild(context, options)).config;
}

export async function createRspackBuild(context: BuildContext, { outputPath }: RspackConfigOptions = {}): Promise<RspackBuild> {
  const { entry, rules, plugins, alias, extensions, externals, middlewares, serverStarted } = mergeContributions(await featureContributions(context));
  const uniqueName = uniqueNameOf(context);
  const config: Configuration = {
    mode: 'development',
    context: context.root,
    target: ['web', 'es2020'],
    entry,
    output: {
      path: outputPath ?? path.join(context.root, OUTPUT_FOLDER),
      publicPath: publicPathOf(context),
      filename: '[name].js',
      chunkFilename: 'chunk.[name].js',
      library: { type: 'amd' },
      uniqueName,
      chunkLoadingGlobal: `webpackJsonp_${uniqueName}`,
      hashFunction: 'xxhash64',
      crossOriginLoading: 'anonymous',
      devtoolModuleFilenameTemplate: 'webpack:///../[resource-path]',
      devtoolFallbackModuleFilenameTemplate: 'webpack:///../[resource-path]?[contenthash]',
    },
    amd: {},
    externalsType: 'amd',
    externals,
    resolve: {
      extensions: [...extensions, ...HEFT_RESOLVE_EXTENSIONS],
      alias,
    },
    module: {
      parser: { javascript: { exportsPresence: 'auto' } },
      rules: [{ test: /\.m?js$/, resolve: { fullySpecified: false } }, ...rules],
    },
    plugins,
    devtool: 'cheap-module-source-map',
    cache: true,
    optimization: { nodeEnv: false },
    performance: { hints: false },
    watchOptions: { ignored: watchIgnored(context.root) },
    infrastructureLogging: { level: 'warn' },
  };
  return { config, middlewares, serverStarted };
}

function uniqueNameOf({ project }: BuildContext): string {
  const name = project.packageJson().name ?? path.basename(project.root);
  return `fast_serve_${createHash('sha256').update(name).digest('hex').slice(0, 16)}`;
}

export function watchIgnored(root: string): RegExp {
  const escapedRoot = root.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedRoot}[\\\\/](?:${IGNORED_PROJECT_FOLDERS.join('|')})(?:[\\\\/]|$)|[\\\\/]node_modules[\\\\/]`);
}
