const JAVASCRIPT_RESERVED_WORDS = new Set([
  'abstract', 'arguments', 'await', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'double', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'final',
  'finally', 'float', 'for', 'function', 'goto', 'if', 'implements', 'import', 'in', 'instanceof', 'int', 'interface',
  'let', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'typeof', 'var', 'void',
  'volatile', 'while', 'with', 'yield',
]);

const ALPHABET_SIZE = 26;
const CHAR_CODE_OF_A = 'a'.charCodeAt(0);

function letterName(index: number): string {
  let name = '';
  for (let remaining = index; remaining >= 0; remaining = Math.floor(remaining / ALPHABET_SIZE) - 1) {
    name = String.fromCharCode(CHAR_CODE_OF_A + (remaining % ALPHABET_SIZE)) + name;
  }
  return name;
}

export function bundleExportNames(count: number): string[] {
  const names: string[] = [];
  for (let index = 0; names.length < count; index++) {
    const name = letterName(index);
    if (!JAVASCRIPT_RESERVED_WORDS.has(name)) names.push(name);
  }
  return names;
}
