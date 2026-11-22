import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Configuration } from '@rspack/core';
import { publicPath, type BuildContext, type ServerMiddleware } from './featureApi/index.js';
import { contributionsInFeatureOrder, FEATURES } from './features.js';
import { mergeContributions } from './merge.js';
import { createPageChannel, type ServedPageChannel } from './pageChannel.js';

export const OUTPUT_FOLDER = path.join('temp', 'fast-serve', 'dist');

const HEFT_RESOLVE_EXTENSIONS = ['.wasm', '.mjs', '.js', '.json', '.jsx'];
const IGNORED_PROJECT_FOLDERS = ['lib', 'lib-[^\\\\/]+', 'dist', 'temp', 'release', 'sharepoint', 'teams', 'jest-output', '\\.heft'];

export interface RspackConfigOptions {
  outputPath?: string;
  hashSalt?: string;
}

export interface RspackBuild {
  config: Configuration;
  middlewares: ServerMiddleware[];
  page: ServedPageChannel;
}

export async function createRspackConfig(context: BuildContext, options: RspackConfigOptions = {}): Promise<Configuration> {
  return (await createRspackBuild(context, options)).config;
}

export async function createRspackBuild(context: BuildContext, { outputPath, hashSalt }: RspackConfigOptions = {}): Promise<RspackBuild> {
  const page = createPageChannel();
  const { entry, rules, plugins, alias, extensions, externals, middlewares } = mergeContributions(await contributionsInFeatureOrder(FEATURES, { ...context, page }));
  const uniqueName = uniqueNameOf(context);
  const config: Configuration = {
    mode: 'development',
    context: context.root,
    target: ['web', 'es2020'],
    entry,
    output: {
      path: outputPath ?? path.join(context.root, OUTPUT_FOLDER),
      publicPath: publicPath(context.options.origin),
      filename: '[name].js',
      chunkFilename: 'chunk.[name].js',
      library: { type: 'amd' },
      uniqueName,
      chunkLoadingGlobal: `webpackJsonp_${uniqueName}`,
      hashFunction: 'xxhash64',
      ...(hashSalt === undefined ? {} : { hashSalt }),
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
  return { config, middlewares, page };
}

function uniqueNameOf({ project }: BuildContext): string {
  const name = project.packageJson().name ?? path.basename(project.root);
  return `fast_serve_${createHash('sha256').update(name).digest('hex').slice(0, 16)}`;
}

export function watchIgnored(root: string): RegExp {
  const escapedRoot = root
    .split(/[\\/]/)
    .map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\\\/]');
  return new RegExp(`^${escapedRoot}[\\\\/](?:${IGNORED_PROJECT_FOLDERS.join('|')})(?:[\\\\/]|$)|[\\\\/]node_modules[\\\\/]`);
}
