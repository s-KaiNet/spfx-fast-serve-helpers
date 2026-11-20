import path from 'node:path';
import { isInside, toPosix } from '../utils/paths.js';

export interface CompileProblem {
  message: string;
  moduleIdentifier?: string;
  moduleName?: string;
  loc?: string;
}

export interface CompileOutcome {
  verb: 'compiled' | 'rebuilt';
  durationMs: number;
  changedFiles: readonly string[];
  errors: number;
  warnings: number;
}

const BUILD_FAILED_WRAPPER = /^\s*× Module build failed \(from [^)]*\):\s*$/;
const WRAPPED_CAUSE_ARROW = /^(\s*)╰─▶/;
const MAX_LISTED_CHANGES = 2;

export function formatCompileProblems(level: 'error' | 'warning', problems: readonly CompileProblem[], root: string, libraryRoots: readonly string[] = []): string[] {
  const formatted = problems.map((problem) => {
    const location = problemLocation(problem, root, libraryRoots);
    const header = location === undefined ? level : `${level} in ${location}`;
    return `${header}\n${tidyMessage(problem.message)}`;
  });
  return [...new Set(formatted)];
}

export function problemLocation({ moduleIdentifier, moduleName, loc }: CompileProblem, root: string, libraryRoots: readonly string[] = []): string | undefined {
  const file = moduleFile(moduleIdentifier, root, libraryRoots) ?? moduleName?.replace(/^\.\//, '');
  if (file === undefined || file === '') return undefined;
  return loc === undefined || loc === '' ? file : `${file}:${loc}`;
}

function moduleFile(moduleIdentifier: string | undefined, root: string, libraryRoots: readonly string[]): string | undefined {
  if (moduleIdentifier === undefined) return undefined;
  const segments = moduleIdentifier.slice(moduleIdentifier.lastIndexOf('!') + 1).split('|');
  const resource = segments.map((segment) => segment.split('?')[0] ?? '').find((segment) => path.isAbsolute(segment));
  if (resource === undefined) return undefined;
  return isCodeFile(resource, root, libraryRoots) ? toPosix(path.relative(root, resource)) : toPosix(resource);
}

function isCodeFile(file: string, root: string, libraryRoots: readonly string[]): boolean {
  return [root, ...libraryRoots].some((codeRoot) => isInside(codeRoot, file) && file !== codeRoot);
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

export function compileSummary({ verb, durationMs, changedFiles, errors, warnings }: CompileOutcome): string {
  const listed = changedFiles.slice(0, MAX_LISTED_CHANGES);
  const more = changedFiles.length - listed.length;
  const changes = listed.length === 0 ? '' : ` (${listed.join(', ')}${more > 0 ? ` +${more} more` : ''})`;
  const counts = [plural(errors, 'error'), plural(warnings, 'warning')].filter((count) => count !== undefined);
  return `${verb} in ${durationMs} ms${changes}${counts.length > 0 ? `: ${counts.join(', ')}` : ''}`;
}

export function changedProjectFiles(root: string, files: Iterable<string>, libraryRoots: readonly string[] = []): string[] {
  return [...new Set([...files].filter((file) => isCodeFile(file, root, libraryRoots)).map((file) => toPosix(path.relative(root, file))))].toSorted();
}

function plural(count: number, noun: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
