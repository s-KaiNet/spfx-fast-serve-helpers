import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { rspack } from '@rspack/core';
import { decodedRequestPath, DIST_PATH, isReadRequest, send, type FeatureContext, type ServerMiddleware } from '../featureApi/index.js';
import { errorMessage } from '../utils/errors.js';
import { toPosix } from '../utils/paths.js';

const HEFT_STRINGS_FILE = /^([^/]+)_([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)\.js$/;

export interface HeftStringsRequest {
  name: string;
  locale: string;
}

export function heftStringsRequest(urlPath: string): HeftStringsRequest | undefined {
  if (!urlPath.startsWith(DIST_PATH)) return undefined;
  const match = HEFT_STRINGS_FILE.exec(urlPath.slice(DIST_PATH.length));
  const [, name, locale] = match ?? [];
  return name === undefined || locale === undefined ? undefined : { name, locale };
}

type AmdFactory = (...dependencies: unknown[]) => unknown;

interface CommonJsModule {
  exports: unknown;
}

export function evaluateStrings(source: string, filename: string): Record<string, unknown> {
  const { code } = rspack.experiments.swc.transformSync(source, {
    filename,
    jsc: { parser: filename.endsWith('.ts') ? { syntax: 'typescript' } : { syntax: 'ecmascript' }, target: 'es2020' },
    module: { type: 'commonjs' },
  });
  const module: CommonJsModule = { exports: {} };
  let defined: { value: unknown } | undefined;
  const define = (...args: unknown[]): void => {
    const factory = args.at(-1);
    const dependencies = Array.isArray(args[0]) ? (args[0] as unknown[]) : [];
    const resolved = dependencies.map((dependency) => (dependency === 'exports' ? module.exports : dependency === 'module' ? module : undefined));
    defined = { value: typeof factory === 'function' ? (factory as AmdFactory)(...resolved) : factory };
  };
  vm.runInNewContext(code, { define, module, exports: module.exports, require: refuseRequire }, { filename });
  const value = defined?.value ?? module.exports;
  const strings = isEsModule(value) ? value.default : value;
  if (typeof strings !== 'object' || strings === null) throw new Error('the file must define or export an object with the strings');
  return strings as Record<string, unknown>;
}

function refuseRequire(request: string): never {
  throw new Error(`strings files can't require "${request}"`);
}

function isEsModule(value: unknown): value is { default: unknown } {
  return typeof value === 'object' && value !== null && (value as { __esModule?: unknown }).__esModule === true && 'default' in value;
}

export function stringsModuleSource(strings: Record<string, unknown>): string {
  return `define([], function () {\n  return ${JSON.stringify(strings, undefined, 2).replaceAll('\n', '\n  ')};\n});\n`;
}

export function heftStringsMiddleware({ root, project, options, logger }: FeatureContext): ServerMiddleware {
  const stringsFile = ({ name, locale }: HeftStringsRequest): string | undefined => {
    const owner = project.codeRoots().find((codeRoot) => codeRoot.project.localizedResources(options.locale).has(name));
    return owner?.project.localizedResourceFile(name, locale);
  };
  return {
    name: 'fast-serve:heft-strings',
    middleware: async (req, res, next) => {
      const urlPath = isReadRequest(req) ? decodedRequestPath(req) : undefined;
      const request = urlPath === undefined ? undefined : heftStringsRequest(urlPath);
      const file = request === undefined ? undefined : stringsFile(request);
      if (request === undefined || file === undefined) {
        next();
        return;
      }
      try {
        send(req, res, 'application/javascript; charset=utf-8', stringsModuleSource(evaluateStrings(await readFile(file, 'utf8'), file)));
      } catch (error) {
        logger.warn(`${request.name}: ${toPosix(path.relative(root, file))} could not be served as ${request.name}_${request.locale}.js: ${errorMessage(error)}`);
        next(error);
      }
    },
  };
}
