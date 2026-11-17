import { readFileSync } from 'node:fs';
import { SourceMap, type SourceMapPayload } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DevEnvironment, Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import type { BrowserErrorReport } from '../runtime/contracts.js';
import { isInside, toPosix } from '../utils/paths.js';
import { readRuntimeSource, runtimeFilePath } from '../utils/runtimeSource.js';
import { type DisplayFrame, formatBrowserError } from './format.js';
import { frameSource, isOwnCode, parseStackFrames, referencesProjectCode, type StackFrame } from './stackFrames.js';

export const BROWSER_ERROR_EVENT = 'fast-serve:browser-error';
export const BROWSER_ERRORS_ID = 'virtual:fast-serve/browser-errors';
export const BROWSER_ERRORS_URL = '/@id/__x00__' + BROWSER_ERRORS_ID;

const RESOLVED_BROWSER_ERRORS_ID = '\0' + BROWSER_ERRORS_ID;
const REPEAT_SUPPRESSION_MS = 2000;
const MAX_FRAMES = 12;
const VITE_REQUEST_PARAMS = ['t', 'v', 'import'];

export function browserErrorsPlugin({ root, options }: Pick<ServeContext, 'root' | 'options'>): Plugin {
  return {
    name: 'fast-serve:browser-errors',
    apply: 'serve',
    config: () => ({ server: { forwardConsole: false } }),

    resolveId: (source) => (source === BROWSER_ERRORS_ID ? RESOLVED_BROWSER_ERRORS_ID : null),
    load(id) {
      if (id !== RESOLVED_BROWSER_ERRORS_ID) return null;
      this.addWatchFile(runtimeFilePath('browserErrors'));
      return readRuntimeSource('browserErrors');
    },

    configureServer(server) {
      const environment = server.environments.client;
      const isRepeated = createRepeatFilter(REPEAT_SUPPRESSION_MS);
      environment.hot.on(BROWSER_ERROR_EVENT, (payload: unknown) => {
        if (!isBrowserErrorReport(payload) || !referencesProjectCode([payload.stack, payload.callStack], options.origin)) return;
        void describeBrowserError(environment, root, options.origin, payload).then((output) => {
          if (!isRepeated(output)) environment.logger.error(output, { timestamp: true });
        });
      });
    },
  };
}

export async function describeBrowserError(environment: DevEnvironment, root: string, origin: string, report: BrowserErrorReport): Promise<string> {
  const stack = report.stack || report.callStack;
  const servedFrames = parseStackFrames(stack).filter((frame) => frameSource(frame.url, origin) !== 'other');
  const lastOwnFrame = servedFrames.findLastIndex((frame) => isOwnCode(frameSource(frame.url, origin)));
  const shownFrames = servedFrames.slice(0, lastOwnFrame >= 0 ? lastOwnFrame + 1 : MAX_FRAMES).slice(0, MAX_FRAMES);
  const frames = await Promise.all(shownFrames.map((frame) => displayFrame(environment, root, frame)));
  return formatBrowserError(report, frames, readSourceFile);
}

async function displayFrame(environment: DevEnvironment, root: string, frame: StackFrame): Promise<DisplayFrame> {
  const { pathname, searchParams } = new URL(frame.url);
  for (const param of VITE_REQUEST_PARAMS) searchParams.delete(param);
  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const fallback = { method: frame.method, location: pathname.slice(1), line: frame.line, column: frame.column };
  const module = await environment.moduleGraph.getModuleByUrl(pathname + query).catch(() => undefined);
  if (!module?.file) return fallback;
  const located = { ...fallback, location: displayPath(root, module.file) };
  const map = module.transformResult?.map;
  if (!map?.mappings) return located;
  const original = new SourceMap(map as SourceMapPayload).findOrigin(frame.line, frame.column);
  if (!('fileName' in original)) return located;
  const sourceFile = resolveSourceFile(module.file, original.fileName);
  return { method: frame.method, location: displayPath(root, sourceFile), sourceFile, line: original.lineNumber, column: original.columnNumber };
}

function resolveSourceFile(moduleFile: string, mappedSource: string): string {
  if (mappedSource.startsWith('file://')) return fileURLToPath(mappedSource);
  return path.resolve(path.dirname(moduleFile), mappedSource);
}

function displayPath(root: string, file: string): string {
  return isInside(root, file) ? toPosix(path.relative(root, file)) : toPosix(file);
}

function readSourceFile(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function createRepeatFilter(windowMs: number): (output: string) => boolean {
  let lastOutput = '';
  let lastAt = 0;
  return (output) => {
    const now = Date.now();
    const repeated = output === lastOutput && now - lastAt < windowMs;
    lastOutput = output;
    lastAt = now;
    return repeated;
  };
}

function isBrowserErrorReport(payload: unknown): payload is BrowserErrorReport {
  if (typeof payload !== 'object' || payload === null) return false;
  const { kind, name, message, stack, callStack } = payload as Record<string, unknown>;
  return (
    (kind === 'error' || kind === 'unhandled-rejection' || kind === 'console-error') &&
    [name, message, stack, callStack].every((value) => typeof value === 'string')
  );
}
