import { parse } from 'es-module-lexer';

export interface MetadataTypeImport {
  readonly importedName: string;
  readonly localName: string;
  readonly from: string;
  readonly importStart: number;
}

export const DECORATOR_METADATA_REFERENCE = /typeof ([\w$]+) === "undefined" \? Object : \1(?![\w$])/g;
const NAMED_IMPORTS = /import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}/y;

export function findMetadataTypeImports(code: string): MetadataTypeImport[] {
  const referenced = new Set([...code.matchAll(DECORATOR_METADATA_REFERENCE)].map((match) => match[1] ?? ''));
  if (referenced.size === 0) return [];
  const [imports] = parse(code);
  return imports.flatMap((entry) => {
    if (entry.type !== 'static' || entry.typeOnly) return [];
    NAMED_IMPORTS.lastIndex = entry.importStart;
    const list = NAMED_IMPORTS.exec(code)?.[1];
    if (list === undefined) return [];
    return list.split(',').flatMap((specifier) => {
      const [importedName = '', , alias] = specifier.trim().split(/\s+/);
      const localName = alias ?? importedName;
      if (importedName === '' || importedName === 'type' || !referenced.has(localName)) return [];
      return [{ importedName, localName, from: entry.specifier, importStart: entry.importStart }];
    });
  });
}
