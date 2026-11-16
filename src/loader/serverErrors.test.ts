import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createServerErrorLog, recordErrorsMiddleware, SERVER_STATUS_PATH, serverStatusMiddleware } from './serverErrors.js';

const transformError = Object.assign(new Error('Transform failed with 1 error:\n\n\u001b[31m[PARSE_ERROR] \u001b[0mUnexpected token\n  frame'), {
  id: '/p/src/webparts/hello/components/Hello.tsx',
  plugin: 'vite:oxc',
  loc: { line: 15, column: 18 },
});

const request = (url: string) => ({ url }) as IncomingMessage;

describe('server error log', () => {
  it('keeps the last error as a short message with a project-relative location', () => {
    const log = createServerErrorLog('/p');
    log.record(transformError);
    expect(log.status().error).toEqual({
      message: '[PARSE_ERROR] Unexpected token',
      location: 'src/webparts/hello/components/Hello.tsx:15:18',
      plugin: 'vite:oxc',
    });
  });

  it('takes the line and column from the printed frame when the error has no loc', () => {
    const log = createServerErrorLog('/p');
    const oxcError = Object.assign(
      new Error('Transform failed with 1 error:\n\n[PARSE_ERROR] Unexpected token\n    ╭─[ src/webparts/hello/components/Hello.tsx:15:18 ]'),
      { id: '/p/src/webparts/hello/components/Hello.tsx', plugin: 'vite:oxc' },
    );
    log.record(oxcError);
    expect(log.status().error?.location).toBe('src/webparts/hello/components/Hello.tsx:15:18');
  });

  it('forgets the error when it is old or after a file change, which bumps the revision', () => {
    const log = createServerErrorLog('/p');
    log.record(transformError);
    expect(log.status()).toMatchObject({ error: { message: '[PARSE_ERROR] Unexpected token' }, fileRevision: 0 });
    expect(log.status(Date.now() + 10 * 60_000).error).toBeNull();
    log.fileChanged();
    expect(log.status()).toEqual({ error: null, fileRevision: 1 });
  });

  it('records errors passing through the middleware chain and serves the last one', () => {
    const log = createServerErrorLog('/p');
    const next = vi.fn<(error?: unknown) => void>();
    const response = { setHeader: vi.fn<(name: string, value: string) => void>(), end: vi.fn<(body: string) => void>() };

    recordErrorsMiddleware(log)(new Error('Failed to resolve import "./nope"'), request('/src/a.ts'), response as unknown as ServerResponse, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));

    serverStatusMiddleware(log)(request(`${SERVER_STATUS_PATH}?t=1`), response as unknown as ServerResponse, next);
    expect(JSON.parse(response.end.mock.calls[0]?.[0] ?? '')).toEqual({ error: { message: 'Failed to resolve import "./nope"' }, fileRevision: 0 });
  });
});
