import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { rolldown } from 'rolldown';
import { isIdentifier, isObject } from '../utils/guards.js';

export type LocFileFormat = 'amd' | 'module';

export interface LocFile {
  strings: Record<string, unknown>;
  format: LocFileFormat;

  files: string[];
}

const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;
const EVALUATION_TIMEOUT_MS = 2000;

export async function readLocFile(file: string): Promise<LocFile> {
  if (!TYPESCRIPT_FILE.test(file)) {
    try {
      return { ...evaluateLocFile(await readFile(file, 'utf8'), file), files: [file] };
    } catch (error) {
      if (!isSyntaxError(error)) throw error;
    }
  }
  const { code, files } = await bundleLocFile(file);
  return { ...evaluateLocFile(code, file), files };
}

function isSyntaxError(error: unknown): boolean {
  return isObject(error) && error.name === 'SyntaxError';
}

export function evaluateLocFile(code: string, file: string): Omit<LocFile, 'files'> {
  let defined: { strings: unknown } | undefined;
  const define = Object.assign(
    (...args: unknown[]) => {
      const factory = args.find((arg) => typeof arg === 'function') as (() => unknown) | undefined;
      defined = { strings: factory ? factory() : args.find(isObject) };
    },
    { amd: true },
  );
  const module: { exports: unknown } = { exports: {} };
  runInNewContext(code, { define, module, exports: module.exports }, { filename: file, timeout: EVALUATION_TIMEOUT_MS });
  const strings = defined ? defined.strings : moduleStrings(module.exports);
  if (!isObject(strings)) throw new Error(`${file} did not define a strings object`);
  return { strings, format: defined ? 'amd' : 'module' };
}

function moduleStrings(moduleExports: unknown): unknown {
  if (!isObject(moduleExports) || Object.keys(moduleExports).length === 0) return undefined;
  return moduleExports.__esModule === true && isObject(moduleExports.default) ? moduleExports.default : moduleExports;
}

async function bundleLocFile(file: string): Promise<{ code: string; files: string[] }> {
  const bundle = await rolldown({ input: file, platform: 'node', logLevel: 'silent' });
  try {
    const { output } = await bundle.generate({ format: 'cjs', exports: 'auto' });
    const [chunk] = output;
    return {
      code: chunk.code,
      files: chunk.moduleIds.filter((id) => path.isAbsolute(id)),
    };
  } finally {
    await bundle.close();
  }
}

export function renderLocModule(strings: Record<string, unknown>): string {
  const keys = Object.keys(strings).filter(isIdentifier);
  return [
    `const strings = ${JSON.stringify(strings, null, 2)};`,
    'export default strings;',
    ...keys.map((key, i) => `const __s${i} = strings[${JSON.stringify(key)}];\nexport { __s${i} as ${key} };`),

    'if (import.meta.hot) import.meta.hot.accept(() => location.reload());',
    '',
  ].join('\n');
}
