import { styleText } from 'node:util';
import type { BrowserErrorReport } from '../runtime/contracts.js';

export interface DisplayFrame {
  readonly method: string;
  readonly location: string;
  readonly sourceFile?: string;
  readonly line: number;
  readonly column: number;
}

const HEADERS: Record<BrowserErrorReport['kind'], string> = {
  error: '[Unhandled error]',
  'unhandled-rejection': '[Unhandled rejection]',
  'console-error': '[console.error]',
};

const CODE_FRAME_CONTEXT_LINES = 2;
const AMD_MISMATCH = 'Mismatched anonymous define()';
const AMD_MISMATCH_HINT =
  "Hint: a script called SharePoint's RequireJS define() without a module name; the stack shows what RequireJS was loading at that moment, not the culprit. " +
  'fast-serve hides define() from dependencies in node_modules, so look for a package listed in "amdPackages" in fast-serve/config.json, ' +
  'a linked package outside node_modules, or an AMD script loaded with a <script> tag.';
const LINE_MARKER_WIDTH = 2;

export interface OverlayError {
  message: string;
  stack: string;
  frame?: string;
  loc?: { file: string; line: number; column: number };
}

type SourceReader = (file: string) => string | undefined;

export function isAmdMismatch(message: string): boolean {
  return message.includes(AMD_MISMATCH);
}

function browserErrorHint(message: string): string | undefined {
  return isAmdMismatch(message) ? AMD_MISMATCH_HINT : undefined;
}

export function formatBrowserError(report: BrowserErrorReport, frames: readonly DisplayFrame[], readSource: SourceReader): string {
  const title = report.kind === 'console-error' ? report.message : `${styleText('bold', report.name)}: ${report.message}`;
  const hint = browserErrorHint(report.message);
  const lines = [styleText('red', `${HEADERS[report.kind]} ${title}`), ...(hint === undefined ? [] : [styleText('yellow', hint)])];
  let codeFrameShown = false;
  for (const frame of frames) {
    lines.push(` > ${[frame.method, `${frame.location}:${frame.line}:${frame.column}`].filter(Boolean).join(' ')}`);
    const source = codeFrameShown || frame.sourceFile === undefined ? undefined : readSource(frame.sourceFile);
    if (source === undefined) continue;
    lines.push(...codeFrame(source, frame.line, frame.column).map((line) => `    ${line}`));
    codeFrameShown = true;
  }
  return lines.join('\n');
}

export function overlayError(report: BrowserErrorReport, frames: readonly DisplayFrame[], readSource: SourceReader): OverlayError {
  const title = report.kind === 'console-error' ? report.message : `${report.name}: ${report.message}`;
  const hint = browserErrorHint(report.message);
  const stack = frames.map((frame) => `    at ${[frame.method, `(${frameLocation(frame)})`].filter(Boolean).join(' ')}`).join('\n');
  const error: OverlayError = { message: `${HEADERS[report.kind]} ${title}${hint === undefined ? '' : `\n\n${hint}`}`, stack };
  const located = frames.find((frame) => frame.sourceFile !== undefined) ?? frames[0];
  if (!located) return error;
  const source = located.sourceFile === undefined ? undefined : readSource(located.sourceFile);
  return {
    ...error,
    loc: { file: located.sourceFile ?? located.location, line: located.line, column: located.column },
    ...(source === undefined ? {} : { frame: unmarkedCodeFrame(source, located.line, located.column) }),
  };
}

function unmarkedCodeFrame(source: string, line: number, column: number): string {
  return codeFrame(source, line, column)
    .map((frameLine) => frameLine.slice(LINE_MARKER_WIDTH))
    .join('\n');
}

function frameLocation(frame: DisplayFrame): string {
  return `${frame.sourceFile ?? frame.location}:${frame.line}:${frame.column}`;
}

export function codeFrame(source: string, line: number, column: number): string[] {
  const sourceLines = source.split(/\r?\n/);
  const first = Math.max(1, line - CODE_FRAME_CONTEXT_LINES);
  const last = Math.min(sourceLines.length, line + CODE_FRAME_CONTEXT_LINES);
  const width = String(last).length;
  const output: string[] = [];
  for (let current = first; current <= last; current++) {
    const marker = current === line ? '>' : ' ';
    output.push(`${marker} ${String(current).padStart(width)} | ${sourceLines[current - 1] ?? ''}`);
    if (current === line) output.push(`  ${' '.repeat(width)} | ${' '.repeat(Math.max(0, column - 1))}^`);
  }
  return output;
}
