import type { ServerMiddleware } from '../rspack/contribution.js';

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Private-Network': 'true',
};

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
