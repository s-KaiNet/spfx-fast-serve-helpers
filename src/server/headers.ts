import { CORS_HEADERS, DIST_PATH, type ServerMiddleware } from '../bundler/featureApi/index.js';

const HOT_UPDATE_FILE = /\.hot-update\.(?:js|json)(?:[?#]|$)/;

export interface ResponseHeaderOptions {
  noStoreBundles?: boolean;
}

export function responseHeaders(url: string | undefined, { noStoreBundles = false }: ResponseHeaderOptions = {}): Record<string, string> {
  if (url === undefined) return { ...CORS_HEADERS };
  const noStore = HOT_UPDATE_FILE.test(url) || (noStoreBundles && url.startsWith(DIST_PATH));
  return noStore ? { ...CORS_HEADERS, 'Cache-Control': 'no-store' } : { ...CORS_HEADERS };
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
