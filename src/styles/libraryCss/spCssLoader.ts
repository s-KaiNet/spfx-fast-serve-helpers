import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { toPosix } from '../../utils/paths.js';
import { createCssClassNameGenerator, type CssClassNameGenerator } from './cssClassName.js';
import { isCssModuleFile } from './resolveLibraryCss.js';

export const SP_CSS_LOADER_PACKAGE = '@microsoft/sp-css-loader';
const SPFX_HEFT_PLUGINS_PACKAGE = '@microsoft/spfx-heft-plugins';

interface SpCssLoaderOptions {
  async: boolean;
  production: boolean;
  generateCssClassName?: CssClassNameGenerator;
}

interface SpCssLoaderContext {
  resourcePath: string;
  context: string;
  rootContext: string;
  sourceMap: boolean;
  getOptions(): SpCssLoaderOptions;
  getResolve(): (context: string, request: string) => Promise<string>;
  emitWarning(warning: unknown): void;
  async(): (error: Error | null | undefined, result?: string) => void;
  utils: { contextify(context: string, request: string): string };
}

type SpCssLoader = (this: SpCssLoaderContext, source: string) => void;

export type LibraryCssCompiler = (file: string) => Promise<string>;

export interface LibraryCssCompilerOptions {
  root: string;
  warn: (message: string) => void;
}

export function createLibraryCssCompiler({ root, warn }: LibraryCssCompilerOptions): LibraryCssCompiler {
  let loader: SpCssLoader | undefined;
  const generateCssClassName = createCssClassNameGenerator();

  return (file) => {
    loader ??= loadSpCssLoader(root);
    const run = loader;
    return new Promise((resolve, reject) => {
      const options: SpCssLoaderOptions = {
        async: true,
        production: false,
        ...(isCssModuleFile(file) ? { generateCssClassName } : {}),
      };
      const context: SpCssLoaderContext = {
        resourcePath: file,
        context: path.dirname(file),
        rootContext: root,
        sourceMap: false,
        getOptions: () => options,
        getResolve: () => (directory, request) => Promise.resolve(path.resolve(directory, request)),
        emitWarning: (warning) => {
          warn(`${file}: ${warning instanceof Error ? warning.message : String(warning)}`);
        },
        async: () => (error, result) => {
          if (error) reject(error);
          else resolve(result ?? '');
        },
        utils: { contextify: contextifyRequest },
      };
      run.call(context, readFileSync(file, 'utf8'));
    });
  };
}

export function resolveSpCssLoader(root: string): string {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  try {
    return projectRequire.resolve(SP_CSS_LOADER_PACKAGE);
  } catch {
    try {
      const heftPlugins = projectRequire.resolve(`${SPFX_HEFT_PLUGINS_PACKAGE}/package.json`);
      return createRequire(heftPlugins).resolve(SP_CSS_LOADER_PACKAGE);
    } catch (error) {
      throw new Error(
        `${SP_CSS_LOADER_PACKAGE} was not found from ${root}. It ships with ${SPFX_HEFT_PLUGINS_PACKAGE} and is needed to compile ` +
          'the precompiled styles (.module.scss.css) of SPFx libraries: reinstall the project dependencies.',
        { cause: error },
      );
    }
  }
}

function loadSpCssLoader(root: string): SpCssLoader {
  const loaderFile = resolveSpCssLoader(root);
  const loaderModule = createRequire(loaderFile)(loaderFile) as { default?: unknown };
  if (typeof loaderModule.default !== 'function') {
    throw new TypeError(`${loaderFile} does not export a webpack loader function`);
  }
  return loaderModule.default as SpCssLoader;
}

function contextifyRequest(context: string, request: string): string {
  if (!path.isAbsolute(request)) return request;
  const relative = toPosix(path.relative(context, request));
  return relative.startsWith('.') ? relative : `./${relative}`;
}
