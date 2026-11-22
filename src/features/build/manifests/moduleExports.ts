import { randomBytes } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rspack, type Compiler, type Configuration, type ExternalItemFunctionData, type Stats } from '@rspack/core';

const OUTPUT_FOLDER = path.join('temp', 'fast-serve', 'manifest-references');
const BARE_REQUEST = /^(?![./]|[a-zA-Z]:[\\/]|data:|file:)/;

export type ModuleExports = { readonly exports: Readonly<Record<string, unknown>> } | { readonly error: string };

interface Evaluation {
  readonly result: ModuleExports;
  readonly dependencies: ReadonlyMap<string, number | undefined>;
}

export class ModuleEvaluator {
  readonly #root: string;
  readonly #evaluations = new Map<string, Promise<Evaluation>>();

  constructor(root: string) {
    this.#root = root;
  }

  async exportsOf(file: string): Promise<ModuleExports> {
    const cached = this.#evaluations.get(file);
    if (cached !== undefined && !(await isStale(await cached))) return (await cached).result;
    const evaluation = evaluate(this.#root, file);
    this.#evaluations.set(file, evaluation);
    return (await evaluation).result;
  }
}

async function isStale({ dependencies }: Evaluation): Promise<boolean> {
  const changes = await Promise.all([...dependencies].map(async ([file, mtime]) => (await modifiedTime(file)) !== mtime));
  return changes.includes(true);
}

async function modifiedTime(file: string): Promise<number | undefined> {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return undefined;
  }
}

async function evaluate(root: string, file: string): Promise<Evaluation> {
  const outputPath = path.join(root, OUTPUT_FOLDER);
  const outputName = `${path.basename(file, path.extname(file))}-${Date.now()}-${randomBytes(4).toString('hex')}.mjs`;
  const outputFile = path.join(outputPath, outputName);
  const compiler = rspack(evaluationConfig(root, file, outputPath, outputName));
  const { error, stats } = await runOnce(compiler);
  await closeCompiler(compiler);
  const files = new Set([file, ...(stats ? localFiles(stats) : [])]);
  const dependencies = new Map(await Promise.all([...files].map(async (dependency) => [dependency, await modifiedTime(dependency)] as const)));
  try {
    const problems = error ? [error.message] : compileErrors(stats);
    if (problems.length > 0) return { result: { error: problems.join('\n') }, dependencies };
    const namespace = (await import(pathToFileURL(outputFile).href)) as Record<string, unknown>;
    return { result: { exports: { ...namespace } }, dependencies };
  } catch (thrown) {
    return { result: { error: thrown instanceof Error ? thrown.message : String(thrown) }, dependencies };
  } finally {
    await rm(outputFile, { force: true });
  }
}

function evaluationConfig(root: string, file: string, outputPath: string, outputName: string): Configuration {
  return {
    mode: 'none',
    context: root,
    target: 'node22',
    entry: file,
    devtool: false,
    output: { path: outputPath, filename: outputName, module: true, library: { type: 'module' }, chunkFormat: 'module' },
    externalsType: 'module',
    externals: [externalPackage],
    module: {
      rules: [
        {
          test: /\.[cm]?tsx?$/,
          loader: 'builtin:swc-loader',
          options: { jsc: { parser: { syntax: 'typescript', tsx: true, decorators: true }, target: 'es2022' } },
          type: 'javascript/auto',
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      extensionAlias: { '.js': ['.ts', '.tsx', '.js'], '.mjs': ['.mts', '.mjs'] },
    },
    node: { __dirname: false, __filename: false, global: false },
    optimization: { minimize: false, splitChunks: false, runtimeChunk: false, concatenateModules: false },
    cache: false,
    infrastructureLogging: { level: 'error' },
    stats: 'none',
  };
}

function externalPackage({ request, dependencyType }: ExternalItemFunctionData): Promise<string | undefined> {
  if (request === undefined || !BARE_REQUEST.test(request)) return Promise.resolve(undefined);
  return Promise.resolve(dependencyType === 'commonjs' ? `node-commonjs ${request}` : `module ${request}`);
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

function compileErrors(stats: Stats | undefined): string[] {
  if (stats === undefined) return [];
  const { errors = [] } = stats.toJson({ all: false, errors: true, moduleTrace: false, errorDetails: false });
  return errors.map((error) => error.message);
}

function localFiles(stats: Stats): string[] {
  return [...stats.compilation.fileDependencies].filter((dependency) => path.isAbsolute(dependency) && !dependency.split(/[\\/]/).includes('node_modules'));
}
