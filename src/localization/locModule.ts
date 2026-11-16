import { runInNewContext } from 'node:vm';
import { isIdentifier, isObject } from '../utils/guards.js';

export function evaluateLocFile(code: string, file: string): Record<string, unknown> {
  let strings: unknown;
  const define = (...args: unknown[]) => {
    const factory = args.find((arg) => typeof arg === 'function') as (() => unknown) | undefined;
    strings = factory ? factory() : args.find(isObject);
  };
  runInNewContext(code, { define }, { filename: file });
  if (!isObject(strings)) throw new Error(`${file} did not define a strings object`);
  return strings;
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
