import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { Connect } from 'vite';
import type { LastServerError, ServerStatus } from '../runtime/contracts.js';
import { toPosix } from '../utils/paths.js';

export const SERVER_STATUS_PATH = '/@spfx/status';
const RECENT_ERROR_WINDOW_MS = 5 * 60_000;

interface ViteLikeError {
  message?: unknown;
  id?: unknown;
  plugin?: unknown;
  loc?: { line?: unknown; column?: unknown };
}

interface RecordedError extends LastServerError {
  recordedAt: number;
}

export interface ServerErrorLog {
  record(error: unknown): void;
  fileChanged(): void;
  status(now?: number): ServerStatus;
}

export function createServerErrorLog(root: string): ServerErrorLog {
  let last: RecordedError | undefined;
  let fileRevision = 0;

  const recentError = (now: number): LastServerError | null => {
    if (!last || now - last.recordedAt > RECENT_ERROR_WINDOW_MS) return null;
    const { recordedAt: _recordedAt, ...error } = last;
    return error;
  };

  return {
    record(error) {
      last = toRecordedError(root, error);
    },
    fileChanged() {
      last = undefined;
      fileRevision++;
    },
    status: (now = Date.now()) => ({ error: recentError(now), fileRevision }),
  };
}

function toRecordedError(root: string, error: unknown): RecordedError {
  const viteError: ViteLikeError = typeof error === 'object' && error !== null ? error : { message: error };
  const message = stripVTControlCharacters(typeof viteError.message === 'string' ? viteError.message : String(error));
  const file = typeof viteError.id === 'string' ? path.resolve(viteError.id.split('?')[0] ?? viteError.id) : undefined;
  const location = file === undefined ? undefined : describeLocation(toPosix(path.relative(root, file)), viteError.loc, message);
  return {
    message: firstMeaningfulLine(message),
    ...(location === undefined ? {} : { location }),
    ...(typeof viteError.plugin === 'string' ? { plugin: viteError.plugin } : {}),
    recordedAt: Date.now(),
  };
}

function describeLocation(relativeFile: string, loc: ViteLikeError['loc'], message: string): string {
  if (typeof loc?.line === 'number' && typeof loc.column === 'number') return `${relativeFile}:${loc.line}:${loc.column}`;
  const printed = new RegExp(`${escapeRegExp(relativeFile)}:\\d+:\\d+`).exec(message);
  return printed?.[0] ?? relativeFile;
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function firstMeaningfulLine(message: string): string {
  const meaningful = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !/^transform failed with \d+ errors?:?$/i.test(line));
  return meaningful ?? message.trim();
}

export function recordErrorsMiddleware(log: ServerErrorLog): Connect.ErrorHandleFunction {
  return (error, _req, _res, next) => {
    log.record(error);
    next(error);
  };
}

export function serverStatusMiddleware(log: ServerErrorLog): Connect.NextHandleFunction {
  return (req, res, next) => {
    if ((req.url ?? '').split('?')[0] !== SERVER_STATUS_PATH) {
      next();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(log.status()));
  };
}
