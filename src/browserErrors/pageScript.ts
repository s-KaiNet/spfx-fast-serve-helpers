import { readFileSync } from 'node:fs';
import { rspack } from '@rspack/core';
import { packageFile } from '../utils/packageFile.js';
import type { PageRuntimeConfig } from './contracts.js';

const INSTALL_FUNCTION = 'installFastServePage';
const EXPORT_KEYWORD = /^export\s+(?=function\s)/m;
const IMPORT_STATEMENT = /^import\s[^;]*;\s*$/gm;
const EMPTY_EXPORT = /^export\s*\{\s*\};?\s*$/gm;

let runtimeSource: string | undefined;

export function pageRuntimeSource(): string {
  runtimeSource ??= loadRuntimeSource();
  return runtimeSource;
}

function loadRuntimeSource(): string {
  const file = packageFile('./runtime/pageRuntime', import.meta.url);
  const source = readFileSync(file, 'utf8');
  const javascript = file.endsWith('.ts') ? rspack.experiments.swc.transformSync(source, { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' } }).code : source;
  return javascript.replaceAll(IMPORT_STATEMENT, '').replaceAll(EMPTY_EXPORT, '').replace(EXPORT_KEYWORD, '').trim();
}

export function renderPageScript(config: PageRuntimeConfig): string {
  return [
    '(function () {',
    "if (typeof window !== 'object' || typeof document !== 'object') return;",
    pageRuntimeSource(),
    `try { ${INSTALL_FUNCTION}(${JSON.stringify(config)}); } catch (error) { console.warn('[fast-serve] browser error forwarding is off:', error); }`,
    '})();',
    '',
  ].join('\n');
}
