import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const MAX_DEPTH = 12;

export function configText(value: unknown): string {
  const ancestors: object[] = [];
  const write = (current: unknown, depth: number): string => {
    if (current === null || current === undefined) return String(current);
    if (typeof current === 'function') return `fn:${current.toString()}`;
    if (typeof current === 'bigint' || typeof current === 'symbol') return current.toString();
    if (typeof current !== 'object') return JSON.stringify(current);
    if (current instanceof RegExp) return `re:${current.toString()}`;
    if (ancestors.includes(current)) return '[circular]';
    if (depth > MAX_DEPTH) return '[deep]';
    ancestors.push(current);
    try {
      if (Array.isArray(current)) return `[${current.map((item) => write(item, depth + 1)).join(',')}]`;
      if (current instanceof Map) return `map{${[...current].map(([key, item]) => `${write(key, depth + 1)}:${write(item, depth + 1)}`).join(',')}}`;
      if (current instanceof Set) return `set[${[...current].map((item) => write(item, depth + 1)).join(',')}]`;
      const name = constructorName(current);
      const entries = Object.keys(current).toSorted().map((key) => `${JSON.stringify(key)}:${propertyText(current, key, depth)}`);
      return `${name}{${entries.join(',')}}`;
    } finally {
      ancestors.pop();
    }
  };
  const propertyText = (owner: object, key: string, depth: number): string => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor?.get) return `get:${descriptor.get.toString()}`;
    return write(descriptor?.value, depth + 1);
  };
  return write(value, 0);
}

function constructorName(value: object): string {
  const prototype = Object.getPrototypeOf(value) as { constructor?: { name?: string } } | null;
  const name = prototype?.constructor?.name ?? '';
  return name === 'Object' ? '' : name;
}

export function filesText(files: readonly string[]): string {
  return [...new Set(files)].toSorted().map((file) => `${file}\n${fileContent(file)}`).join('\n');
}

function fileContent(file: string): string {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return 'missing';
  }
}

export function fingerprint(...parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\0');
  return hash.digest('hex').slice(0, 24);
}
