import type { ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import type { StartDevServerOptions } from './devServer.js';
import { startDevSession } from './devSession.js';

function fakeServers() {
  const servers: { close: ReturnType<typeof vi.fn<() => Promise<void>>> }[] = [];
  const requests: StartDevServerOptions[] = [];
  const start = vi.fn<(options: StartDevServerOptions) => Promise<ViteDevServer>>((options) => {
    requests.push(options);
    const server = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) };
    servers.push(server);
    return Promise.resolve(server as unknown as ViteDevServer);
  });
  return { servers, requests, start };
}

const logger = { info: vi.fn<(message: string) => void>(), warn: () => undefined, error: () => undefined };

describe('startDevSession', () => {
  it('closes the server and starts a new one on a full restart', async () => {
    const { servers, requests, start } = fakeServers();
    const session = await startDevSession({ root: '/project', cli: { port: 4400 }, logger, start, onRestartFailed: () => undefined });
    requests[0]?.requestFullRestart?.('fast-serve/vite.extend.mts found, restarting fast-serve');
    await vi.waitFor(() => {
      expect(start).toHaveBeenCalledTimes(2);
    });
    expect(servers[0]?.close).toHaveBeenCalledTimes(1);
    expect(requests[1]).toMatchObject({ root: '/project', cli: { port: 4400 } });
    expect(logger.info).toHaveBeenCalledWith('fast-serve/vite.extend.mts found, restarting fast-serve');
    await session.close();
    expect(servers[1]?.close).toHaveBeenCalledTimes(1);
  });

  it('reports a failed restart', async () => {
    const { requests, start } = fakeServers();
    const onRestartFailed = vi.fn<(error: unknown) => void>();
    await startDevSession({ root: '/project', logger, start, onRestartFailed });
    start.mockRejectedValueOnce(new Error('port in use'));
    requests[0]?.requestFullRestart?.('restart');
    await vi.waitFor(() => {
      expect(onRestartFailed).toHaveBeenCalledWith(new Error('port in use'));
    });
  });
});
