import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rspack, type Compiler, type Configuration, type ExternalItemFunctionData, type Stats } from '@rspack/core';
import { problemLocation, tidyMessage } from '../index.js';
import { isObject } from '../../shared/guards.js';
import { PACKAGE_ROOT } from '../../shared/packageInfo.js';
import { packageFile } from '../../shared/packageFile.js';
import { isInside } from '../../shared/paths.js';
import { FAST_SERVE_ENV, type FastServeContext } from './context.js';

export interface LoadedExtend {
  readonly file: string;
  readonly config: Configuration;
  readonly dependencies: readonly string[];
}

export class ExtendLoadError extends Error {
  readonly file: string;
  readonly dependencies: readonly string[];

  constructor(file: string, message: string, dependencies: readonly string[], options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExtendLoadError';
    this.file = file;
    this.dependencies = dependencies;
  }
}

interface BundledExtend {
  outputFile: string;
  dependencies: string[];
}

export async function loadExtendFile(file: string, context: FastServeContext): Promise<LoadedExtend> {
  const { outputFile, dependencies } = await bundleExtendFile(file, context.root);
  let exported: unknown;
  try {
    const module = (await import(pathToFileURL(outputFile).href)) as { default?: { default?: unknown } };
    exported = module.default?.default;
  } catch (error) {
    throw new ExtendLoadError(file, describeError(error), dependencies, { cause: error });
  } finally {
    await rm(outputFile, { force: true });
  }
  const config = await evaluateExport(file, exported, context, dependencies);
  return { file, config, dependencies };
}

async function evaluateExport(file: string, exported: unknown, context: FastServeContext, dependencies: string[]): Promise<Configuration> {
  let config: unknown;
  try {
    config = typeof exported === 'function' ? await (exported as (...args: unknown[]) => unknown)(context, FAST_SERVE_ENV) : await exported;
  } catch (error) {
    throw new ExtendLoadError(file, describeError(error), dependencies, { cause: error });
  }
  if (!isObject(config)) {
    const what = typeof exported === 'function' ? 'its config function returned' : 'its default export is';
    throw new ExtendLoadError(file, `${what} ${describeValue(config)}; export default a Rspack configuration object or defineConfig((context, env) => ({ … }))`, dependencies);
  }
  return config;
}

function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.stack ?? error.message;
}

interface CompileOutcome {
  error: Error | null;
  stats: Stats | undefined;
}

function runOnce(compiler: Compiler): Promise<CompileOutcome> {
  return new Promise((resolve) => {
    compiler.run((error, stats) => {
      resolve({ error, stats });
    });
  });
}

function closeCompiler(compiler: Compiler): Promise<void> {
  return new Promise((resolve) => {
    compiler.close(() => {
      resolve();
    });
  });
}

async function bundleExtendFile(file: string, root: string): Promise<BundledExtend> {
  const unique = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const outputName = `.${path.basename(file)}.timestamp-${unique}.mjs`;
  const outputFile = path.join(path.dirname(file), outputName);
  const entry = path.join(path.dirname(file), `.${path.basename(file)}.entry-${unique}.mjs`);
  const compiler = rspack(extendBundleConfig({ file, entry, root, outputName }));
  const { error, stats } = await runOnce(compiler);
  await closeCompiler(compiler);
  const dependencies = stats ? localDependencies(stats, root, entry) : [file];
  const problems = error ? [error.message] : stats ? bundleErrors(stats, root) : [];
  if (problems.length === 0) return { outputFile, dependencies };
  await rm(outputFile, { force: true });
  throw new ExtendLoadError(file, problems.join('\n'), dependencies, error ? { cause: error } : undefined);
}

const LOADER_HELP = /\n\s*help:\s*\n\s*File was processed with these loaders:[\s\S]*?You may need an additional loader[^\n]*/;

function bundleErrors(stats: Stats, root: string): string[] {
  const { errors = [] } = stats.toJson({ all: false, errors: true, moduleTrace: false, errorDetails: false });
  return errors.map((error) => {
    const location = problemLocation(error, root);
    const message = tidyMessage(error.message.replace(LOADER_HELP, ''));
    return location === undefined ? message : `in ${location}\n${message}`;
  });
}

function localDependencies(stats: Stats, root: string, entry: string): string[] {
  const files = [...stats.compilation.fileDependencies].filter(
    (dependency) =>
      path.isAbsolute(dependency) &&
      !dependency.split(/[\\/]/).includes('node_modules') &&
      !isInside(PACKAGE_ROOT, dependency) &&
      dependency !== entry &&
      dependency !== path.join(root, 'package.json'),
  );
  return [...new Set(files)].toSorted();
}

const BARE_REQUEST = /^(?![./]|[a-zA-Z]:[\\/]|data:|file:)/;

function externalPackages({ request, dependencyType }: ExternalItemFunctionData): Promise<string | undefined> {
  if (request === undefined || !BARE_REQUEST.test(request)) return Promise.resolve(undefined);
  return Promise.resolve(dependencyType === 'commonjs' ? `node-commonjs ${request}` : `module ${request}`);
}

interface ExtendBundle {
  file: string;
  entry: string;
  root: string;
  outputName: string;
}

function extendBundleConfig({ file, entry, root, outputName }: ExtendBundle): Configuration {
  return {
    mode: 'none',
    context: root,
    target: 'node22',
    entry,
    plugins: [new rspack.experiments.VirtualModulesPlugin({ [entry]: `import * as extend from ${JSON.stringify(file)};\nexport default extend;` })],
    devtool: false,
    output: { path: path.dirname(file), filename: outputName, module: true, library: { type: 'module' }, chunkFormat: 'module' },
    externalsType: 'module',
    externals: [externalPackages],
    module: {
      parser: { javascript: { dynamicImportMode: 'eager', exportsPresence: 'auto' } },
      rules: [
        {
          test: /\.[cm]?tsx?$/,
          loader: 'builtin:swc-loader',
          options: { jsc: { parser: { syntax: 'typescript', tsx: false }, target: 'es2022' } },
          type: 'javascript/auto',
        },
        { test: /\.[cm]?[jt]sx?$/, exclude: /[\\/]node_modules[\\/]/, loader: packageFile('./sourceDirLoader', import.meta.url) },
      ],
    },
    resolve: {
      extensions: ['.mts', '.ts', '.mjs', '.js', '.cts', '.cjs', '.json'],
      extensionAlias: { '.js': ['.ts', '.js'], '.mjs': ['.mts', '.mjs'], '.cjs': ['.cts', '.cjs'] },
    },
    node: { __dirname: false, __filename: false, global: false },
    optimization: { minimize: false, splitChunks: false, runtimeChunk: false, concatenateModules: false },
    cache: false,
    infrastructureLogging: { level: 'error' },
    stats: 'none',
  };
}
