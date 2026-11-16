import { existsSync, readFileSync } from 'node:fs';

export function stripJsonComments(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (char === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') i++;
      }
      out += text.slice(start, i + 1);
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += char;
    }
  }
  return out.replaceAll(/,(\s*[}\]])/g, '$1');
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonComments(text));
}

export function readJsoncFile(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    return parseJsonc(text);
  } catch (error) {
    throw new Error(`Cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function readOptionalJsoncFile(file: string): unknown {
  return existsSync(file) ? readJsoncFile(file) : undefined;
}
