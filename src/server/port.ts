import { createServer } from 'node:net';
import { OPTIONS_FILE } from '../config/index.js';

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];
const UNAVAILABLE_ADDRESS_CODES = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

export async function assertPortFree(port: number): Promise<void> {
  const codes = await Promise.all(LOOPBACK_ADDRESSES.map((host) => tryListen(port, host)));
  if (codes.includes('EADDRINUSE')) throw portInUseError(port);
  codes.forEach((code, index) => {
    if (code !== undefined && !UNAVAILABLE_ADDRESS_CODES.has(code)) throw new Error(`Cannot listen on ${LOOPBACK_ADDRESSES[index]}:${port} (${code})`);
  });
}

export function portInUseError(port: number): Error {
  return new Error(
    `Port ${port} is already in use (another fast-serve or "heft start" may be running). ` +
      `Stop it, or choose another port: fast-serve --port ${port + 1}, or "port" in ${OPTIONS_FILE}.`,
  );
}

function tryListen(port: number, host: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code ?? 'UNKNOWN');
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => {
        resolve(undefined);
      });
    });
  });
}
