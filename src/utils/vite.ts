import type { ServerResponse } from 'node:http';

const STYLE_REQUEST = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?|$)/;

export const BARE_SPECIFIER_FILTER = /^[\w@]/;

export function withoutQuery(id: string): string {
  return id.split('?', 1)[0] ?? id;
}

export function isStyleRequest(id: string | undefined): boolean {
  return id !== undefined && STYLE_REQUEST.test(id);
}

export function sendJavaScript(res: ServerResponse, code: string): void {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(code);
}
