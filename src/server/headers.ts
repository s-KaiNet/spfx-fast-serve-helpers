import type { ServerMiddleware } from '../rspack/contribution.js';

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Private-Network': 'true',
};

const HOT_UPDATE_FILE = /\.hot-update\.(?:js|json)(?:[?#]|$)/;

export function responseHeaders(url: string | undefined): Record<string, string> {
  return url !== undefined && HOT_UPDATE_FILE.test(url) ? { ...CORS_HEADERS, 'Cache-Control': 'no-store' } : { ...CORS_HEADERS };
}

export function preflightMiddleware(): ServerMiddleware {
  return {
    name: 'fast-serve:preflight',
    middleware: (req, res, next) => {
      if (req.method !== 'OPTIONS') {
        next();
        return;
      }
      for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);
      res.statusCode = 204;
      res.end();
    },
  };
}
