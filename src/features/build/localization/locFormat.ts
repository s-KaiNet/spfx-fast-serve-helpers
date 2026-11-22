import { readFileSync } from 'node:fs';

export type LocFileFormat = 'amd' | 'module';

const AMD_DEFINE_CALL = /(?:^|[^.\w$])define\s*\(/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(?:^|[^:\\])\/\/.*$/gm;

export function locFileFormat(source: string): LocFileFormat {
  return AMD_DEFINE_CALL.test(source.replaceAll(BLOCK_COMMENT, '').replaceAll(LINE_COMMENT, '')) ? 'amd' : 'module';
}

export function readLocFileFormat(file: string): LocFileFormat {
  try {
    return locFileFormat(readFileSync(file, 'utf8'));
  } catch {
    return 'amd';
  }
}

export function moduleLocWrapperSource(file: string): string {
  return [
    `var strings = require(${JSON.stringify(file)});`,
    'module.exports = strings && strings.__esModule && strings.default !== undefined ? strings.default : strings;',
    '',
  ].join('\n');
}
