import { readFileSync } from 'node:fs';
import { rspack } from '@rspack/core';
import { packageFile } from './packageFile.js';

const EXPORT_KEYWORD = /^export\s+(?=function\s)/gm;
const IMPORT_STATEMENT = /^import\s[^;]*;\s*$/gm;
const EMPTY_EXPORT = /^export\s*\{\s*\};?\s*$/gm;

export function loadRuntimeSource(relativeUrl: string, base: string): string {
  const file = packageFile(relativeUrl, base);
  const source = readFileSync(file, 'utf8');
  const javascript = file.endsWith('.ts') ? rspack.experiments.swc.transformSync(source, { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' } }).code : source;
  return javascript.replaceAll(IMPORT_STATEMENT, '').replaceAll(EMPTY_EXPORT, '').replaceAll(EXPORT_KEYWORD, '').trim();
}
