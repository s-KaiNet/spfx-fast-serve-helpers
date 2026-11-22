import type { IncomingMessage, ServerResponse } from 'node:http';

export function requestPath(req: IncomingMessage): string {
  const url = req.url ?? '/';
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function decodedRequestPath(req: IncomingMessage): string | undefined {
  try {
    return decodeURI(requestPath(req));
  } catch {
    return undefined;
  }
}

export function isReadRequest(req: IncomingMessage): boolean {
  return req.method === 'GET' || req.method === 'HEAD';
}

export function send(req: IncomingMessage, res: ServerResponse, contentType: string, body: string | Buffer): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(req.method === 'HEAD' ? undefined : body);
}

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'HEAD, GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Private-Network': 'true',
};

export function sendJson(res: ServerResponse, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = 200;
  for (const [header, value] of Object.entries(CORS_HEADERS)) res.setHeader(header, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(text);
}
