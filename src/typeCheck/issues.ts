import { readFileSync } from 'node:fs';
import path from 'node:path';
import { codeFrame } from '../browserErrors/index.js';
import { toPosix } from '../utils/paths.js';

export interface TypeIssue {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly file?: string | undefined;
  readonly location?: { readonly start: { readonly line: number; readonly column: number } } | undefined;
}

export interface TypeCheckResult {
  readonly errors: number;
  readonly warnings: number;
  readonly summary: string;
  readonly blocks: readonly string[];
}

export type SourceReader = (file: string) => string | undefined;

export const MAX_LISTED_ISSUES = 20;

export function readSourceFile(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function issuesKey(issues: readonly TypeIssue[]): string {
  return JSON.stringify(issues.map(issueIdentity).toSorted());
}

function issueIdentity({ severity, code, message, file, location }: TypeIssue): string {
  return JSON.stringify([file ?? '', location?.start.line ?? 0, location?.start.column ?? 0, code, severity, message]);
}

export function formatIssue(issue: TypeIssue, root: string, readSource: SourceReader = readSourceFile): string {
  const location = issueLocation(issue, root);
  const header = location === undefined ? `type ${issue.severity}` : `type ${issue.severity} in ${location}`;
  const lines = [header, `${issue.code}: ${issue.message}`];
  const source = issue.file === undefined || issue.location === undefined ? undefined : readSource(issue.file);
  if (source !== undefined && issue.location !== undefined) lines.push(...codeFrame(source, issue.location.start.line, issue.location.start.column));
  return lines.join('\n');
}

function issueLocation({ file, location }: TypeIssue, root: string): string | undefined {
  if (file === undefined) return undefined;
  const relative = toPosix(path.relative(root, file));
  return location === undefined ? relative : `${relative}:${location.start.line}:${location.start.column}`;
}

export function typeCheckResult(issues: readonly TypeIssue[], root: string, readSource: SourceReader = readSourceFile): TypeCheckResult {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const ordered = issues.toSorted(byLocation);
  const listed = ordered.slice(0, MAX_LISTED_ISSUES).map((issue) => formatIssue(issue, root, readSource));
  const more = ordered.length - listed.length;
  return {
    errors,
    warnings,
    summary: typeCheckSummary(errors, warnings),
    blocks: more > 0 ? [...listed, `… and ${more} more type ${more === 1 ? 'issue' : 'issues'} (heft build lists them all)`] : listed,
  };
}

function byLocation(first: TypeIssue, second: TypeIssue): number {
  return (
    (first.file ?? '').localeCompare(second.file ?? '') ||
    (first.location?.start.line ?? 0) - (second.location?.start.line ?? 0) ||
    (first.location?.start.column ?? 0) - (second.location?.start.column ?? 0) ||
    first.code.localeCompare(second.code)
  );
}

export function typeCheckSummary(errors: number, warnings: number): string {
  const counts = [plural(errors, 'error'), plural(warnings, 'warning')].filter((count) => count !== undefined);
  return `type check: ${counts.length === 0 ? 'no errors' : counts.join(', ')}`;
}

function plural(count: number, noun: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function issuesOutside(issues: readonly TypeIssue[], files: ReadonlySet<string>): TypeIssue[] {
  return issues.filter((issue) => issue.file === undefined || !files.has(path.normalize(issue.file)));
}

export type IssuesChangeDetector = (issues: readonly TypeIssue[]) => boolean;

export function createIssuesChangeDetector(): IssuesChangeDetector {
  let previous: string | undefined;
  return (issues) => {
    const key = issuesKey(issues);
    const changed = key !== previous;
    previous = key;
    return changed;
  };
}
