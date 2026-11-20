import { describe, expect, it } from 'vitest';
import { CORS_HEADERS } from '../featureApi/index.js';
import { responseHeaders } from './headers.js';

describe('responseHeaders', () => {
  it('adds no-store to hot-update manifests and chunks', () => {
    for (const url of ['/dist/hello.0123abcd.hot-update.json', '/dist/hello.0123abcd.hot-update.js', '/dist/hello.0123abcd.hot-update.js?t=1']) {
      expect(responseHeaders(url)).toEqual({ ...CORS_HEADERS, 'Cache-Control': 'no-store' });
    }
  });

  it('sends only the CORS headers for everything else', () => {
    for (const url of ['/dist/hello.js', '/dist/hello.js.map', undefined]) expect(responseHeaders(url)).toEqual(CORS_HEADERS);
  });
});
