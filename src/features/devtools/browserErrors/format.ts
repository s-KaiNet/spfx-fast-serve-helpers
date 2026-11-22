import { styleText } from 'node:util';
import { codeFrame } from '../../../shared/codeFrame.js';
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
  'hot-update-error': '[Hot update error]',
  'console-error': '[console.error]',
  'load-error': '[Bundle load error]',
};

const OVERLAY_TITLES: Record<BrowserErrorReport['kind'], string> = {
  error: 'Uncaught runtime error',
  'unhandled-rejection': 'Unhandled promise rejection',
  'hot-update-error': 'Updated module failed to run',
  'console-error': 'console.error',
  'load-error': 'Bundle load error',
};

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
