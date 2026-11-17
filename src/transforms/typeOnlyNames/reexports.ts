import { MagicString } from 'magic-string';
import { parse } from 'es-module-lexer';

export interface ValueReexport {
  readonly importedName: string;
  readonly exportedName: string;
  readonly from: string;
  readonly exportStart: number;
  readonly bindingImportStart: number | undefined;
}

const EXPORT_LIST = /export\s*\{([^}]*)\}/y;
const IMPORT_LIST = /import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}/y;

export function findValueReexports(code: string): ValueReexport[] {
  const [imports, exports] = parse(code);
  return exports.flatMap((entry) => {
    if (entry.type !== 'reexport' || entry.typeOnly || entry.importName === null || entry.importName === '*') return [];
    const importStatementStart = imports[entry.importIndex]?.importStart;
    return [
      {
        importedName: entry.importName,
        exportedName: entry.name,
        from: entry.from,
        exportStart: entry.exportStart,
        bindingImportStart: importStatementStart === entry.exportStart ? undefined : importStatementStart,
      },
    ];
  });
}

export function collectRuntimeExports(code: string): { names: Set<string>; starSources: string[] } {
  const [, exports] = parse(code);
  const names = new Set<string>();
  const starSources: string[] = [];
  for (const entry of exports) {
    if (entry.type === 'reexport-all') starSources.push(entry.from);
    else names.add(entry.name);
  }
  return { names, starSources };
}

export interface ImportedTypeName {
  readonly importedName: string;
  readonly importStart: number;
}

export function removeReexports(code: string, reexports: readonly ValueReexport[], importedTypes: readonly ImportedTypeName[] = []): MagicString {
  const output = new MagicString(code);
  for (const [exportStart, group] of groupBy(reexports, (reexport) => reexport.exportStart)) {
    const exportedNames = new Set(group.map((reexport) => reexport.exportedName));
    removeSpecifiers(output, code, EXPORT_LIST, exportStart, (specifier) => exportedNames.has(specifier.binding));
  }
  const removedImports: ImportedTypeName[] = [
    ...reexports.flatMap(({ importedName, bindingImportStart }) => (bindingImportStart === undefined ? [] : [{ importedName, importStart: bindingImportStart }])),
    ...importedTypes,
  ];
  for (const [importStart, group] of groupBy(removedImports, (entry) => entry.importStart)) {
    const importedNames = new Set(group.map((entry) => entry.importedName));
    removeSpecifiers(output, code, IMPORT_LIST, importStart, (specifier) => importedNames.has(specifier.source));
  }
  return output;
}

interface Specifier {
  readonly source: string;
  readonly binding: string;
}

function removeSpecifiers(output: MagicString, code: string, list: RegExp, statementStart: number, shouldRemove: (specifier: Specifier) => boolean): void {
  list.lastIndex = statementStart;
  const match = list.exec(code);
  const content = match?.[1];
  if (!match || content === undefined) return;
  const contentStart = match.index + match[0].lastIndexOf(content);
  const kept = content
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier !== '' && !shouldRemove(parseSpecifier(specifier)));
  output.overwrite(contentStart, contentStart + content.length, kept.length > 0 ? ` ${kept.join(', ')} ` : ' ');
}

function parseSpecifier(specifier: string): Specifier {
  const [source = '', , alias] = specifier.split(/\s+/);
  return { source, binding: alias ?? source };
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}
