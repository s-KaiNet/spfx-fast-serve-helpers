import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { Logger } from '../logger.js';
import { isInside, toPosix } from '../utils/paths.js';
import type { BrowserErrorReport, BrowserErrorResponse } from './contracts.js';
import { type DisplayFrame, formatBrowserError, formatReport, overlayTitle } from './format.js';
import { describeLoadError, loadErrorHeadline, loadErrorPageMessage, type LoadErrorFacts } from './loadErrors.js';
import type { BundleSourceMaps } from './sourceMaps.js';
import { parseStackFrames, servedFile } from './stackFrames.js';

export interface MappedFrame extends DisplayFrame {
  readonly project: boolean;
}

export interface BrowserErrorReporterOptions {
  root: string;
  codeRoots?: readonly string[];
  distUrl: string;
  overlay: boolean;
  logger: Pick<Logger, 'error'>;
  sourceMaps: BundleSourceMaps;
  loadErrorFacts: () => LoadErrorFacts;
  now?: () => number;
}

const MAX_FRAMES = 12;
const REPEAT_SUPPRESSION_MS = 2000;
const NODE_MODULES = /[\\/]node_modules[\\/]/;
const STALE_MODULE_HINT = 'the page keeps running the previous version of this module until the error is fixed';

export class BrowserErrorReporter {
  private lastSignature = '';
  private lastReportedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: BrowserErrorReporterOptions) {}

  async report(report: BrowserErrorReport): Promise<BrowserErrorResponse> {
    const frames = await this.mapFrames(report.stack || report.callStack);
    if (report.kind === 'load-error') return this.reportLoadError(report, frames);
    if (!frames.some((frame) => frame.project)) return {};
    const repeated = this.isRepeated(errorSignature(report, frames));
    if (repeated && report.kind === 'console-error') return {};
    const text = formatBrowserError(report, frames, readSourceFile, report.kind === 'hot-update-error' ? STALE_MODULE_HINT : undefined);
    if (!repeated) this.options.logger.error(text);
    if (report.kind === 'console-error') return {};
    return this.overlayResponse(overlayTitle(report), text);
  }

  private overlayResponse(title: string, text: string): BrowserErrorResponse {
    return this.options.overlay ? { overlay: { title, text: stripVTControlCharacters(text) } } : {};
  }

  async mapFrames(stack: string): Promise<MappedFrame[]> {
    const served = parseStackFrames(stack).flatMap((frame) => {
      const file = servedFile(frame.url, this.options.distUrl);
      return file === undefined ? [] : [{ ...frame, file }];
    });
    const mapped = await Promise.all(served.map((frame) => this.mapFrame(frame.method, frame.file, frame.line, frame.column)));
    const lastProjectFrame = mapped.findLastIndex((frame) => frame.project);
    return mapped.slice(0, lastProjectFrame >= 0 ? lastProjectFrame + 1 : MAX_FRAMES).slice(0, MAX_FRAMES);
  }

  private async mapFrame(method: string, file: string, line: number, column: number): Promise<MappedFrame> {
    const origin = await this.options.sourceMaps.originOf(file, line, column);
    if (origin === undefined) return { method, location: `dist/${file}`, line, column, project: false };
    const { root, codeRoots = [root] } = this.options;
    const project = codeRoots.some((codeRoot) => isInside(codeRoot, origin.file)) && !NODE_MODULES.test(origin.file) && existsSync(origin.file);
    const location = isInside(root, origin.file) || project ? toPosix(path.relative(root, origin.file)) : toPosix(origin.file);
    const frame = { method, location, line: origin.line, project, ...(project ? { sourceFile: origin.file } : {}) };
    return origin.column === undefined ? frame : { ...frame, column: origin.column };
  }

  private reportLoadError(report: BrowserErrorReport, frames: readonly MappedFrame[]): BrowserErrorResponse {
    const description = describeLoadError(report, this.options.loadErrorFacts());
    const pageMessage = loadErrorPageMessage(report, description);
    const text = formatReport(loadErrorHeadline(report, description), description.showFrames ? frames : [], readSourceFile);
    if (!this.isRepeated(`load\n${report.bundle ?? ''}\n${description.reason}`)) this.options.logger.error(text);
    const thrownByProjectCode = description.showFrames && frames.some((frame) => frame.project);
    return thrownByProjectCode ? { pageMessage, ...this.overlayResponse(overlayTitle(report), text) } : { pageMessage };
  }

  private isRepeated(signature: string): boolean {
    const now = (this.options.now ?? Date.now)();
    const repeated = signature === this.lastSignature && now - this.lastReportedAt < REPEAT_SUPPRESSION_MS;
    this.lastSignature = signature;
    this.lastReportedAt = now;
    return repeated;
  }
}

export function errorSignature(report: BrowserErrorReport, frames: readonly DisplayFrame[]): string {
  const first = frames.find((frame) => frame.sourceFile !== undefined) ?? frames[0];
  const location = first ? `${first.location}:${first.line}` : '';
  return [report.kind === 'console-error' ? 'console' : 'uncaught', report.name, report.message, location].join('\n');
}

function readSourceFile(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
