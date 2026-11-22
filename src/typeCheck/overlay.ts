import type { ServerResponse } from 'node:http';
import { CORS_HEADERS, isReadRequest, requestPath, TYPE_CHECK_EVENTS_PATH, type PageChannel, type ServerMiddleware } from '../featureApi/index.js';
import { loadRuntimeSource } from '../utils/runtimeSource.js';
import type { TypeCheckResult } from './issues.js';

const INSTALL_FUNCTION = 'installTypeCheckOverlay';
const RECONNECT_MS = 2000;

export interface OverlayContent {
  readonly title: string;
  readonly text: string;
}

export interface TypeCheckOverlay {
  readonly middleware: ServerMiddleware;
  publish(result: TypeCheckResult): void;
}

let runtimeSource: string | undefined;

export function renderTypeCheckOverlayScript(origin: string): string {
  runtimeSource ??= loadRuntimeSource('./runtime/typeCheckOverlay', import.meta.url);
  const config = { origin, eventsUrl: `${origin}${TYPE_CHECK_EVENTS_PATH}` };
  return [
    '(function () {',
    "if (typeof window !== 'object' || typeof document !== 'object') return;",
    runtimeSource,
    `try { ${INSTALL_FUNCTION}(${JSON.stringify(config)}); } catch (error) { console.warn('[fast-serve] the type check overlay is off:', error); }`,
    '})();',
    '',
  ].join('\n');
}

export function overlayContent({ errors, warnings, summary, blocks }: TypeCheckResult): OverlayContent | undefined {
  if (errors + warnings === 0) return undefined;
  return { title: summary.replace(/^type check/, 'Type check'), text: blocks.join('\n\n') };
}

export function createTypeCheckOverlay(origin: string, page: PageChannel): TypeCheckOverlay {
  const clients = new Set<ServerResponse>();
  let current: OverlayContent | undefined;
  const event = () => `data: ${JSON.stringify(current ?? null)}\n\n`;
  page.addPageScript(() => renderTypeCheckOverlayScript(origin));
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
        res.setHeader('Cache-Control', 'no-store');
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
