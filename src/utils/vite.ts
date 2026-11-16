import type { ServerResponse } from 'node:http';

export const STYLE_REQUEST = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?|$)/;

export function isStyleRequest(id: string | undefined): boolean {
  return id !== undefined && STYLE_REQUEST.test(id);
}

export function sendJavaScript(res: ServerResponse, code: string): void {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(code);
}
