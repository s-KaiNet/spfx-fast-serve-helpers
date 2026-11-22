const CONST_ENUM = /\bconst\s+enum\s+([\w$]+)/g;
const EXPORTED_CONST_ENUM = /\bexport\s+(?:declare\s+)?const\s+enum\s+([\w$]+)/g;
const MODULE_SYNTAX = /^\s*(?:import|export)\b/m;
const GLOBAL_AUGMENTATION = /\bdeclare\s+global\s*\{/g;

export function globalConstEnums(declarationSource: string): string[] {
  const source = withoutComments(declarationSource);
  if (!MODULE_SYNTAX.test(source)) return constEnumNames(source, CONST_ENUM);
  return globalAugmentations(source).flatMap((block) => constEnumNames(block, CONST_ENUM));
}

export function exportedConstEnums(declarationSource: string): string[] {
  return constEnumNames(withoutComments(declarationSource), EXPORTED_CONST_ENUM);
}

function constEnumNames(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? '').filter(Boolean);
}

function globalAugmentations(source: string): string[] {
  return [...source.matchAll(GLOBAL_AUGMENTATION)].map((match) => {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    for (let index = bodyStart; index < source.length; index++) {
      if (source[index] === '{') depth++;
      else if (source[index] === '}' && --depth === 0) return source.slice(bodyStart, index);
    }
    return source.slice(bodyStart);
  });
}

function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
}

export function referencedGlobals(code: string, names: readonly string[]): string[] {
  return names.filter((name) => {
    const escaped = name.replaceAll('$', '\\$');
    const used = new RegExp(`(?<![\\w$.])${escaped}\\s*[.[]`).test(code);
    const declared = new RegExp(
      `\\b(?:var|let|const|function|class|enum)\\s+${escaped}(?![\\w$])|\\bimport\\b[^;]*?(?<![\\w$])${escaped}(?![\\w$])[^;]*?\\bfrom\\b`,
    ).test(code);
    return used && !declared;
  });
}
