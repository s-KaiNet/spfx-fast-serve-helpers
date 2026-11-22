import path from 'node:path';
import { toPosix } from '../utils/paths.js';
import type { FileLintResult, LintMessage } from './protocol.js';

export const MAX_LISTED_MESSAGES = 20;

export interface LintOutput {
  readonly level: 'info' | 'warn';
  readonly text: string;
}

export interface LintReport {
  update(result: FileLintResult): LintOutput | undefined;
  forget(file: string): void;
}

export function createLintReport(root: string): LintReport {
  const reported = new Map<string, string>();
  return {
    update(result) {
      if (result.status === 'unparsable') return undefined;
      const messages = result.status === 'linted' ? result.messages : [];
      const previous = reported.get(result.file);
      if (messages.length === 0) {
        reported.delete(result.file);
        return previous === undefined ? undefined : { level: 'info', text: `lint: ${displayPath(root, result.file)}: clean` };
      }
      const key = messagesKey(messages);
      if (key === previous) return undefined;
      reported.set(result.file, key);
      return { level: 'warn', text: formatFileMessages(root, result.file, messages) };
    },
    forget(file) {
      reported.delete(file);
    },
  };
}

export function messagesKey(messages: readonly LintMessage[]): string {
  return JSON.stringify(messages.toSorted(byLocation).map(({ line, column, severity, ruleId, message }) => [line, column, severity, ruleId ?? '', message]));
}

export function formatFileMessages(root: string, file: string, messages: readonly LintMessage[]): string {
  const ordered = messages.toSorted(byLocation);
  const listed = ordered.slice(0, MAX_LISTED_MESSAGES);
  const lines = [`lint: ${displayPath(root, file)}: ${lintCounts(messages)}`, ...alignedMessages(listed)];
  const more = ordered.length - listed.length;
  if (more > 0) lines.push(`  … and ${more} more`);
  return lines.join('\n');
}

export function lintCounts(messages: readonly LintMessage[]): string {
  const errors = messages.filter((message) => message.severity === 'error').length;
  const warnings = messages.length - errors;
  return [plural(errors, 'error'), plural(warnings, 'warning')].filter((count) => count !== undefined).join(', ');
}

function alignedMessages(messages: readonly LintMessage[]): string[] {
  const locations = messages.map(({ line, column }) => `${line}:${column}`);
  const width = Math.max(0, ...locations.map((location) => location.length));
  return messages.map(({ severity, message, ruleId }, index) => {
    const rule = ruleId === undefined ? '' : `  ${ruleId}`;
    return `  ${(locations[index] ?? '').padEnd(width)}  ${severity.padEnd('warning'.length)}  ${message}${rule}`;
  });
}

function displayPath(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}

function byLocation(first: LintMessage, second: LintMessage): number {
  return first.line - second.line || first.column - second.column || (first.ruleId ?? '').localeCompare(second.ruleId ?? '');
}

function plural(count: number, noun: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
