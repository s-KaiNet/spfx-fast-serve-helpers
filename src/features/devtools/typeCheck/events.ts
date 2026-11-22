import type { ServerResponse } from 'node:http';
import { CORS_HEADERS, isReadRequest, requestPath, TYPE_CHECK_EVENTS_PATH, type PageChannel, type ServerMiddleware } from '../../../bundler/featureApi/index.js';
import type { TypeCheckResult } from './issues.js';

const RECONNECT_MS = 2000;

export interface OverlayContent {
  readonly title: string;
  readonly text: string;
}

export interface TypeCheckEvents {
  readonly middleware: ServerMiddleware;
  publish(result: TypeCheckResult): void;
}

export function overlayContent({ errors, warnings, summary, blocks }: TypeCheckResult): OverlayContent | undefined {
  if (errors + warnings === 0) return undefined;
  return { title: summary.replace(/^type check/, 'Type check'), text: blocks.join('\n\n') };
}

export function createTypeCheckEvents(page: PageChannel): TypeCheckEvents {
  const clients = new Set<ServerResponse>();
  let current: OverlayContent | undefined;
  const event = () => `data: ${JSON.stringify(current ?? null)}\n\n`;
  page.onServerStarted((server) => {
    server.onStop(() => {
      for (const client of clients) client.end();
      clients.clear();
    });
  });
  return {
    middleware: {
      name: 'fast-serve:type-check-events',
      middleware: (req, res, next) => {
        if (!isReadRequest(req) || requestPath(req) !== TYPE_CHECK_EVENTS_PATH) {
          next();
          return;
        }
        res.statusCode = 200;
        for (const [header, value] of Object.entries(CORS_HEADERS)) res.setHeader(header, value);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.write(`retry: ${RECONNECT_MS}\n${event()}`);
        clients.add(res);
        req.on('close', () => {
          clients.delete(res);
        });
      },
    },
    publish(result) {
      current = overlayContent(result);
      const message = event();
      for (const client of clients) client.write(message);
    },
  };
}
