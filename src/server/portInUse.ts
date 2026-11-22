import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import type { Logger } from '../logger.js';
import { errorMessage } from '../utils/errors.js';
import { assertPortFree, isPortFree, PortInUseError } from './port.js';
import { describePortOwner, findPortOwner, shortenCommand, type PortOwner } from './portOwner.js';

export interface KeyInput {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  on(event: 'data' | 'end', listener: (chunk?: unknown) => void): unknown;
  off(event: 'data' | 'end', listener: (chunk?: unknown) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface FreePortDependencies {
  logger: Logger;
  interactive: boolean;
  confirm: () => Promise<boolean>;
  findOwner: (port: number) => Promise<PortOwner | undefined>;
  stop: (pid: number, force: boolean) => Promise<void>;
  isFree: (port: number) => Promise<boolean>;
  protectedPids: readonly number[];
  graceMs?: number;
  freeTimeoutMs?: number;
  pollMs?: number;
}

const GRACE_MS = 3000;
const FREE_TIMEOUT_MS = 5000;
const POLL_MS = 100;
const ENTER_KEYS = new Set(['\r', '\n']);
const CANCEL_KEYS = new Set(['\u0003', '\u0004']);

export async function freePortOrAsk(port: number, dependencies: FreePortDependencies): Promise<void> {
  try {
    await assertPortFree(port);
    return;
  } catch (error) {
    if (!(error instanceof PortInUseError) || !dependencies.interactive) throw error;
  }
  const { logger, confirm, findOwner, protectedPids } = dependencies;
  const owner = await findOwner(port).catch(() => undefined);
  if (owner === undefined) throw new PortInUseError(port, undefined, 'The process holding the port could not be identified');
  if (protectedPids.includes(owner.pid)) throw new PortInUseError(port, owner);
  logger.warn(`Port ${port} is in use by ${describePortOwner(owner)}${owner.command === undefined ? '' : `: ${shortenCommand(owner.command)}`}`);
  logger.info('Press Enter to stop it and continue, or Ctrl+C to cancel.');
  if (!(await confirm())) throw new Error(`Cancelled: port ${port} is still in use by ${describePortOwner(owner)}, nothing was stopped.`);
  await stopOwner(port, owner, dependencies);
  logger.info(`stopped ${describePortOwner(owner)}, port ${port} is free`);
}

async function stopOwner(port: number, owner: PortOwner, { stop, isFree, graceMs = GRACE_MS, freeTimeoutMs = FREE_TIMEOUT_MS, pollMs = POLL_MS }: FreePortDependencies): Promise<void> {
  const freedGracefully = await stop(owner.pid, false).then(
    () => waitUntilFree(port, isFree, graceMs, pollMs),
    () => false,
  );
  if (freedGracefully) return;
  try {
    await stop(owner.pid, true);
  } catch (error) {
    throw new PortInUseError(port, owner, `Could not stop ${describePortOwner(owner)}: ${errorMessage(error)}`);
  }
  if (!(await waitUntilFree(port, isFree, freeTimeoutMs, pollMs))) throw new PortInUseError(port, owner, `The port is still busy ${freeTimeoutMs / 1000} s after stopping ${describePortOwner(owner)}`);
}

function waitUntilFree(port: number, isFree: (port: number) => Promise<boolean>, timeoutMs: number, pollMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<boolean> => {
    if (await isFree(port)) return true;
    if (Date.now() >= deadline) return false;
    await delay(pollMs);
    return poll();
  };
  return poll();
}

export function waitForEnter(input: KeyInput): Promise<boolean> {
  return new Promise((resolve) => {
    const wasRaw = input.isRaw === true;
    const finish = (answer: boolean) => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.setRawMode(wasRaw);
      input.pause();
      resolve(answer);
    };
    const onData = (chunk?: unknown) => {
      const key = Array.from(String(chunk)).find((character) => ENTER_KEYS.has(character) || CANCEL_KEYS.has(character));
      if (key !== undefined) finish(ENTER_KEYS.has(key));
    };
    const onEnd = () => {
      finish(false);
    };
    input.setRawMode(true);
    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}

export function stopProcess(pid: number, force: boolean, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform === 'win32') return taskkill(pid, force);
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code !== 'ESRCH') return Promise.reject(new Error(code === 'EPERM' ? 'permission denied (it may belong to another user)' : errorMessage(error)));
  }
  return Promise.resolve();
}

function taskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('taskkill', [...(force ? ['/F'] : []), '/PID', String(pid)], { timeout: GRACE_MS, windowsHide: true, encoding: 'utf8' }, (error, _stdout, stderr) => {
      if (error === null) resolve();
      else reject(new Error(stderr.trim() || error.message));
    });
  });
}

export interface TerminalPortCheckOptions {
  logger: Logger;
  input?: KeyInput;
  output?: { readonly isTTY?: boolean };
  platform?: NodeJS.Platform;
}

export function terminalPortCheck({ logger, input = process.stdin, output = process.stdout, platform = process.platform }: TerminalPortCheckOptions): (port: number) => Promise<void> {
  const protectedPids = [process.pid, process.ppid];
  return (port) =>
    freePortOrAsk(port, {
      logger,
      interactive: input.isTTY === true && output.isTTY === true,
      confirm: () => waitForEnter(input),
      findOwner: (busyPort) => findPortOwner(busyPort, { platform, excludedPids: protectedPids }),
      stop: (pid, force) => stopProcess(pid, force, platform),
      isFree: isPortFree,
      protectedPids,
    });
}
