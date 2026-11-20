import path from 'node:path';
import { isInside, toPosix } from '../utils/paths.js';

const BUILD_FAILED_WRAPPER = /^\s*× Module build failed \(from [^)]*\):\s*$/;
const WRAPPED_CAUSE_ARROW = /^(\s*)╰─▶/;

export interface CompileProblem {
  message: string;
  moduleIdentifier?: string;
  moduleName?: string;
  loc?: string;
}

export function problemLocation({ moduleIdentifier, moduleName, loc }: CompileProblem, root: string, codeRoots: readonly string[] = [root]): string | undefined {
  const file = moduleFile(moduleIdentifier, root, codeRoots) ?? moduleName?.replace(/^\.\//, '');
  if (file === undefined || file === '') return undefined;
  return loc === undefined || loc === '' ? file : `${file}:${loc}`;
}

function moduleFile(moduleIdentifier: string | undefined, root: string, codeRoots: readonly string[]): string | undefined {
  if (moduleIdentifier === undefined) return undefined;
  const segments = moduleIdentifier.slice(moduleIdentifier.lastIndexOf('!') + 1).split('|');
  const resource = segments.map((segment) => segment.split('?')[0] ?? '').find((segment) => path.isAbsolute(segment));
  if (resource === undefined) return undefined;
  return isCodeFile(resource, codeRoots) ? toPosix(path.relative(root, resource)) : toPosix(resource);
}

export function isCodeFile(file: string, codeRoots: readonly string[]): boolean {
  return codeRoots.some((codeRoot) => isInside(codeRoot, file) && file !== codeRoot);
}

export function tidyMessage(message: string): string {
  const lines = message.split('\n').map((line) => line.trimEnd());
  if (BUILD_FAILED_WRAPPER.test(lines[0] ?? '') && WRAPPED_CAUSE_ARROW.test(lines[1] ?? '')) {
    lines.shift();
    lines[0] = (lines[0] ?? '').replace(WRAPPED_CAUSE_ARROW, (_match, indent: string) => `${indent}   `);
  }
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  while (lines.length > 0 && lines[0] === '') lines.shift();
  const indent = Math.min(...lines.filter((line) => line !== '').map((line) => line.length - line.trimStart().length));
  return lines.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}
