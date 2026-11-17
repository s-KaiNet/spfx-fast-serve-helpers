import path from 'node:path';
import { toPosix } from '../../utils/paths.js';
import { groupBy } from './reexports.js';

export interface MissingReexport {
  readonly name: string;
  readonly from: string;
  readonly target: string;
}

export function formatTypeReexportMessage(root: string, id: string, source: string, missing: readonly MissingReexport[]): string {
  const file = toPosix(path.relative(root, id));
  const lines = [
    `TypeScript types are re-exported as values in ${file}. Types don't exist at runtime, so these exports would break the module in the browser; fast-serve removed them from the served code.`,
  ];
  for (const { name, target } of missing) {
    const location = locateExportedName(source, name);
    const where = location ? `${file}:${location.line}:${location.column}` : file;
    lines.push(`  ${where}: "${name}" is not a runtime export of ${target} (probably an interface or a type).`);
  }
  lines.push('Mark them as type-only re-exports, for example:');
  for (const [from, group] of groupBy(missing, (entry) => entry.from)) {
    lines.push(`  export type { ${group.map((entry) => entry.name).join(', ')} } from '${from}';`);
  }
  return lines.join('\n');
}

const EXPORT_LISTS = /\bexport\s*\{([^}]*)\}/g;
const IMPORT_LISTS = /\bimport\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}/g;

export function formatMetadataImportMessage(root: string, id: string, source: string, missing: readonly MissingReexport[]): string {
  const file = toPosix(path.relative(root, id));
  const lines = [
    `TypeScript types are imported without \`type\` in ${file}, and emitDecoratorMetadata references them, so the imports are kept and would break the module in the browser. fast-serve removed them from the served code (their metadata is \`Object\`, as with tsc).`,
  ];
  for (const { name, target } of missing) {
    const location = locateName(source, name, IMPORT_LISTS);
    const where = location ? `${file}:${location.line}:${location.column}` : file;
    lines.push(`  ${where}: "${name}" is not a runtime export of ${target} (probably an interface or a type).`);
  }
  lines.push('Mark them as type-only imports, for example:');
  for (const [from, group] of groupBy(missing, (entry) => entry.from)) {
    lines.push(`  import type { ${group.map((entry) => entry.name).join(', ')} } from '${from}';`);
  }
  return lines.join('\n');
}

export function locateExportedName(source: string, name: string): { line: number; column: number } | undefined {
  return locateName(source, name, EXPORT_LISTS);
}

function locateName(source: string, name: string, lists: RegExp): { line: number; column: number } | undefined {
  const namePattern = new RegExp(`(?<![\\w$])${name.replaceAll('$', '\\$')}(?![\\w$])`);
  for (const match of source.matchAll(lists)) {
    const listStart = match.index + match[0].indexOf('{') + 1;
    const nameMatch = namePattern.exec(match[1] ?? '');
    if (nameMatch) return lineAndColumn(source, listStart + nameMatch.index);
  }
  return undefined;
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
}
