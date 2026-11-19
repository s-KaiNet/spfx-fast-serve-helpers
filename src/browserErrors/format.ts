import { styleText } from 'node:util';
import type { BrowserErrorReport } from './contracts.js';

export interface DisplayFrame {
  readonly method: string;
  readonly location: string;
  readonly sourceFile?: string;
  readonly line: number;
  readonly column?: number;
}

export type SourceReader = (file: string) => string | undefined;

const HEADERS: Record<BrowserErrorReport['kind'], string> = {
  error: '[Unhandled error]',
  'unhandled-rejection': '[Unhandled rejection]',
  'console-error': '[console.error]',
  'load-error': '[Bundle load error]',
};

const OVERLAY_TITLES: Record<BrowserErrorReport['kind'], string> = {
  error: 'Uncaught runtime error',
  'unhandled-rejection': 'Unhandled promise rejection',
  'console-error': 'console.error',
  'load-error': 'Bundle load error',
};

const CODE_FRAME_CONTEXT_LINES = 2;

export function errorTitle(report: BrowserErrorReport): string {
  return report.kind === 'console-error' ? report.message : `${report.name}: ${report.message}`;
}

export function overlayTitle(report: BrowserErrorReport): string {
  return OVERLAY_TITLES[report.kind];
}

export function formatBrowserError(report: BrowserErrorReport, frames: readonly DisplayFrame[], readSource: SourceReader, hint?: string): string {
  const title = report.kind === 'console-error' ? report.message : `${styleText('bold', report.name)}: ${report.message}`;
  return formatReport(`${HEADERS[report.kind]} ${title}`, frames, readSource, hint);
}

export function formatReport(headline: string, frames: readonly DisplayFrame[], readSource: SourceReader, hint?: string): string {
  const lines = [styleText('red', headline), ...(hint === undefined ? [] : [styleText('yellow', hint)])];
  let codeFrameShown = false;
  for (const frame of frames) {
    lines.push(` > ${[frame.method, frameLocation(frame)].filter(Boolean).join(' ')}`);
    const source = codeFrameShown || frame.sourceFile === undefined ? undefined : readSource(frame.sourceFile);
    if (source === undefined) continue;
    lines.push(...codeFrame(source, frame.line, frame.column).map((line) => `    ${line}`));
    codeFrameShown = true;
  }
  return lines.join('\n');
}

export function frameLocation(frame: DisplayFrame): string {
  return frame.column === undefined ? `${frame.location}:${frame.line}` : `${frame.location}:${frame.line}:${frame.column}`;
}

export function codeFrame(source: string, line: number, column?: number): string[] {
  const sourceLines = source.split(/\r?\n/);
  const first = Math.max(1, line - CODE_FRAME_CONTEXT_LINES);
  const last = Math.min(sourceLines.length, line + CODE_FRAME_CONTEXT_LINES);
  const width = String(last).length;
  const output: string[] = [];
  for (let current = first; current <= last; current++) {
    const marker = current === line ? '>' : ' ';
    output.push(`${marker} ${String(current).padStart(width)} | ${sourceLines[current - 1] ?? ''}`.trimEnd());
    if (current === line && column !== undefined) output.push(`  ${' '.repeat(width)} | ${' '.repeat(Math.max(0, column - 1))}^`);
  }
  return output;
}
