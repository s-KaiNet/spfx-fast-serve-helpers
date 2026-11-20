import { CORS_HEADERS, type ServerMiddleware } from '../featureApi/index.js';

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
