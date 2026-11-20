import path from 'node:path';
import { isCodeFile, problemLocation, tidyMessage, type CompileProblem } from '../rspack/index.js';
import { toPosix } from '../utils/paths.js';

export interface CompileOutcome {
  verb: 'compiled' | 'rebuilt';
  durationMs: number;
  changedFiles: readonly string[];
  errors: number;
  warnings: number;
}

const MAX_LISTED_CHANGES = 2;

export function formatCompileProblems(level: 'error' | 'warning', problems: readonly CompileProblem[], root: string, codeRoots: readonly string[] = [root]): string[] {
  const formatted = problems.map((problem) => {
    const location = problemLocation(problem, root, codeRoots);
    const header = location === undefined ? level : `${level} in ${location}`;
    return `${header}\n${tidyMessage(problem.message)}`;
  });
  return [...new Set(formatted)];
}

export function compileSummary({ verb, durationMs, changedFiles, errors, warnings }: CompileOutcome): string {
  const listed = changedFiles.slice(0, MAX_LISTED_CHANGES);
  const more = changedFiles.length - listed.length;
  const changes = listed.length === 0 ? '' : ` (${listed.join(', ')}${more > 0 ? ` +${more} more` : ''})`;
  const counts = [plural(errors, 'error'), plural(warnings, 'warning')].filter((count) => count !== undefined);
  return `${verb} in ${durationMs} ms${changes}${counts.length > 0 ? `: ${counts.join(', ')}` : ''}`;
}

export function changedProjectFiles(root: string, files: Iterable<string>, codeRoots: readonly string[] = [root]): string[] {
  return [...new Set([...files].filter((file) => isCodeFile(file, codeRoots)).map((file) => toPosix(path.relative(root, file))))].toSorted();
}

function plural(count: number, noun: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
