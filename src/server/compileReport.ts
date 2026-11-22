import path from 'node:path';
import { isCodeFile, problemLocation, tidyMessage, type CompileProblem } from '../bundler/index.js';
import { toPosix } from '../shared/paths.js';

export interface CompileOutcome {
  verb: 'compiled' | 'rebuilt';
  durationMs: number;
  changedFiles: readonly string[];
  errors: number;
  warnings: number;
}

const MAX_LISTED_CHANGES = 2;

export interface CompileChange {
  changedModules: number;
  errors: readonly string[];
  warnings: readonly string[];
}

export type CompileReportGate = (change: CompileChange) => boolean;

export function createCompileReportGate(): CompileReportGate {
  let reported: string | undefined;
  return ({ changedModules, errors, warnings }) => {
    const problemsKey = JSON.stringify([errors, warnings]);
    const report = reported === undefined || changedModules > 0 || problemsKey !== reported;
    reported = problemsKey;
    return report;
  };
}

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
