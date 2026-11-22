import path from 'node:path';
import { toPosix } from '../../shared/paths.js';

export interface AmbientEnumUse {
  readonly name: string;
  readonly declarationFile: string;
}

const PER_FILE_COMPILE = "heft (tsc) inlines const enum values, but fast-serve compiles each file on its own and can't";

export function formatAmbientEnumMessage(root: string, id: string, uses: readonly AmbientEnumUse[]): string {
  const file = relative(root, id);
  const lines = [`${file} uses const enums that are only declared in .d.ts files, so they don't exist in the browser (ReferenceError). ${PER_FILE_COMPILE}:`];
  for (const { name, declarationFile } of uses) lines.push(`  ${name}: a global \`declare const enum\` in ${relative(root, declarationFile)}`);
  lines.push('Declare them as a regular `enum` (or `export const enum`) in a .ts file and import them.');
  return lines.join('\n');
}

export function formatDeclarationImportMessage(root: string, importer: string, source: string, declarationFile: string, constEnums: readonly string[]): string {
  const enums = constEnums.length > 0 ? ` (it declares the const enums ${constEnums.join(', ')})` : '';
  return [
    `${relative(root, importer)} imports '${source}', which only exists as a declaration file: ${relative(root, declarationFile)}${enums}. It has no JavaScript, so the import can't be served. ${PER_FILE_COMPILE}.`,
    `Move the enums to a .ts file as a regular \`enum\` (or \`export const enum\`), or use \`import type\` if you only need types from '${source}'.`,
  ].join('\n');
}

function relative(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}
