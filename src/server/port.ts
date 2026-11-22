import { createServer } from 'node:net';
import { OPTIONS_FILE } from '../config/index.js';
import { describePortOwner, type PortOwner } from './portOwner.js';

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];
const UNAVAILABLE_ADDRESS_CODES = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

export async function assertPortFree(port: number): Promise<void> {
  const codes = await Promise.all(LOOPBACK_ADDRESSES.map((host) => tryListen(port, host)));
  if (codes.includes('EADDRINUSE')) throw portInUseError(port);
  codes.forEach((code, index) => {
    if (code !== undefined && !UNAVAILABLE_ADDRESS_CODES.has(code)) throw new Error(`Cannot listen on ${LOOPBACK_ADDRESSES[index]}:${port} (${code})`);
  });
}

export class PortInUseError extends Error {
  constructor(
    readonly port: number,
    owner?: PortOwner,
    reason?: string,
  ) {
    super(
      `${reason === undefined ? '' : `${reason}. `}Port ${port} is already in use${owner === undefined ? '' : ` by ${describePortOwner(owner)}`} ` +
        `(another fast-serve or "heft start" may be running). Stop it, or choose another port: fast-serve --port ${port + 1}, or "port" in ${OPTIONS_FILE}.`,
    );
    this.name = 'PortInUseError';
  }
}

export function portInUseError(port: number, owner?: PortOwner, reason?: string): PortInUseError {
  return new PortInUseError(port, owner, reason);
}

export async function isPortFree(port: number): Promise<boolean> {
  try {
    await assertPortFree(port);
    return true;
  } catch {
    return false;
  }
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
