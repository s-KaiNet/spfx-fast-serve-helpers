import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SOURCE_EXTENSIONS } from '../project/sourcePaths.js';

const IMPORT_SPECIFIER = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

export function findUsedLibraries(sourceDir: string, libraryNames: ReadonlySet<string>): string[] {
  const used = new Set<string>();
  for (const file of walk(sourceDir)) {
    if (!(SOURCE_EXTENSIONS as readonly string[]).includes(path.extname(file))) continue;
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1];
      if (specifier !== undefined && libraryNames.has(specifier)) used.add(specifier);
    }
  }
  return [...used].toSorted();
}

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}
