import { existsSync } from 'node:fs';
import path from 'node:path';
import { isStyleRequest } from '../../utils/vite.js';

const STYLE_SPECIFIER = /\.(scss|sass|css)$/;
const CSS_MODULE_FILE = /\.module(?:\.scss)?\.css$/i;

export function resolveLibraryCssFile(source: string, importer: string | undefined): string | undefined {
  if (!importer || importer.startsWith('\0') || isStyleRequest(importer)) return undefined;
  const specifier = withoutQuery(source);
  if (!STYLE_SPECIFIER.test(specifier) || !isPathSpecifier(specifier)) return undefined;
  const requested = path.resolve(path.dirname(withoutQuery(importer)), specifier);
  const compiled = requested + '.css';
  return !existsSync(requested) && existsSync(compiled) ? compiled : undefined;
}

export function isCssModuleFile(file: string): boolean {
  return CSS_MODULE_FILE.test(file);
}

function isPathSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || path.isAbsolute(specifier);
}

function withoutQuery(id: string): string {
  return id.split('?', 1)[0] ?? id;
}
