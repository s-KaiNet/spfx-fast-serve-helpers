import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { createServer, type Server } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Logger } from '../logger.js';
import { PortInUseError } from './port.js';
import { freePortOrAsk, stopProcess, terminalPortCheck, waitForEnter, type FreePortDependencies, type KeyInput } from './portInUse.js';
import { findPortOwner, runCommand, type PortOwner } from './portOwner.js';

class FakeInput extends EventEmitter implements KeyInput {
  readonly isTTY = true;
  isRaw: boolean;
  paused = true;
  readonly rawModes: boolean[] = [];

  constructor(isRaw = false) {
    super();
    this.isRaw = isRaw;
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    this.rawModes.push(mode);
    return this;
  }

  resume(): this {
    this.paused = false;
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  press(keys: string): void {
    this.emit('data', Buffer.from(keys));
  }
}

function recordingLogger(onInfo: (message: string) => void = () => undefined): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (message) => {
      lines.push(message);
      onInfo(message);
    },
    warn: (message) => lines.push(message),
    error: (message) => lines.push(message),
  };
}

function listen(port: number, host = '127.0.0.1'): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port, host, exclusive: true }, () => {
      resolve(server);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

async function freePort(): Promise<number> {
  const server = await listen(0);
  const address = server.address();
  await closeServer(server);
  if (address === null || typeof address === 'string') throw new Error('no port');
  return address.port;
}

describe('waitForEnter', () => {
  it('answers true on Enter, ignoring other keys, and restores the terminal', async () => {
    const input = new FakeInput();
    const answer = waitForEnter(input);
    expect(input.isRaw).toBe(true);
    expect(input.paused).toBe(false);
    input.press('y');
    input.press('\r');
    await expect(answer).resolves.toBe(true);
    expect(input.isRaw).toBe(false);
    expect(input.paused).toBe(true);
    expect(input.listenerCount('data') + input.listenerCount('end')).toBe(0);
  });

  it.each([
    ['Ctrl+C', (input: FakeInput) => {
      input.press('\u0003');
    }],
    ['Ctrl+D', (input: FakeInput) => {
      input.press('\u0004');
    }],
    ['end of input', (input: FakeInput) => {
      input.emit('end');
    }],
  ])('answers false on %s', async (_name, finish) => {
    const input = new FakeInput();
    const answer = waitForEnter(input);
    finish(input);
    await expect(answer).resolves.toBe(false);
    expect(input.listenerCount('data') + input.listenerCount('end')).toBe(0);
  });

  it('keeps raw mode on when it was on before', async () => {
    const input = new FakeInput(true);
    const answer = waitForEnter(input);
    input.press('\n');
    await answer;
    expect(input.rawModes).toEqual([true, true]);
  });
});

describe('freePortOrAsk', () => {
  let busy: Server;
  let port: number;

  beforeEach(async () => {
    port = await freePort();
    busy = await listen(port);
  });

  afterEach(async () => {
    await closeServer(busy);
  });

  const owner: PortOwner = { pid: 42, name: 'node', command: 'node server.js' };

  function dependencies(overrides: Partial<FreePortDependencies> = {}): FreePortDependencies & { stops: string[]; logger: ReturnType<typeof recordingLogger> } {
    const stops: string[] = [];
    return {
      logger: recordingLogger(),
      interactive: true,
      confirm: () => Promise.resolve(true),
      findOwner: () => Promise.resolve(owner),
      stop: (pid, force) => {
        stops.push(`${force ? 'force' : 'term'} ${pid}`);
        return Promise.resolve();
      },
      isFree: () => Promise.resolve(stops.length > 0),
      protectedPids: [1],
      graceMs: 30,
      freeTimeoutMs: 30,
      pollMs: 5,
      ...overrides,
      stops,
    } as FreePortDependencies & { stops: string[]; logger: ReturnType<typeof recordingLogger> };
  }

  it('does nothing when the port is free', async () => {
    const deps = dependencies({ confirm: () => Promise.reject(new Error('asked')) });
    const free = await freePort();
    await expect(freePortOrAsk(free, deps)).resolves.toBeUndefined();
    expect(deps.logger.lines).toEqual([]);
  });

  it('keeps today\'s error without a terminal: no lookup, no prompt, nothing stopped', async () => {
    const deps = dependencies({ interactive: false, findOwner: () => Promise.reject(new Error('looked up')) });
    const error = await freePortOrAsk(port, deps).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PortInUseError);
    expect((error as Error).message).toBe(
      `Port ${port} is already in use (another fast-serve or "heft start" may be running). Stop it, or choose another port: fast-serve --port ${port + 1}, or "port" in fast-serve/config.json.`,
    );
    expect(deps.stops).toEqual([]);
    expect(deps.logger.lines).toEqual([]);
  });

  it('asks, stops the owner on Enter and continues once the port is free', async () => {
    const deps = dependencies();
    await expect(freePortOrAsk(port, deps)).resolves.toBeUndefined();
    expect(deps.logger.lines).toEqual([
      `Port ${port} is in use by node (pid 42): node server.js`,
      'Press Enter to stop it and continue, or Ctrl+C to cancel.',
      `stopped node (pid 42), port ${port} is free`,
    ]);
    expect(deps.stops).toEqual(['term 42']);
  });

  it('exits without stopping anything on Ctrl+C', async () => {
    const deps = dependencies({ confirm: () => Promise.resolve(false) });
    await expect(freePortOrAsk(port, deps)).rejects.toThrow(`Cancelled: port ${port} is still in use by node (pid 42), nothing was stopped.`);
    expect(deps.stops).toEqual([]);
  });

  it('does not offer to stop a process it cannot identify', async () => {
    const deps = dependencies({ findOwner: () => Promise.resolve(undefined), confirm: () => Promise.reject(new Error('asked')) });
    await expect(freePortOrAsk(port, deps)).rejects.toThrow(`The process holding the port could not be identified. Port ${port} is already in use (`);
    const failingLookup = dependencies({ findOwner: () => Promise.reject(new Error('lsof crashed')), confirm: () => Promise.reject(new Error('asked')) });
    await expect(freePortOrAsk(port, failingLookup)).rejects.toThrow('could not be identified');
  });

  it('never offers to stop its own process or its parent', async () => {
    const deps = dependencies({ protectedPids: [42], confirm: () => Promise.reject(new Error('asked')) });
    await expect(freePortOrAsk(port, deps)).rejects.toThrow(`Port ${port} is already in use by node (pid 42) (`);
    expect(deps.stops).toEqual([]);
  });

  it('forces the stop when the port is still busy after the grace time', async () => {
    const stops: string[] = [];
    const deps = dependencies({
      stop: (pid, force) => {
        stops.push(`${force ? 'force' : 'term'} ${pid}`);
        return Promise.resolve();
      },
      isFree: () => Promise.resolve(stops.includes('force 42')),
    });
    await expect(freePortOrAsk(port, deps)).resolves.toBeUndefined();
    expect(stops).toEqual(['term 42', 'force 42']);
  });

  it('forces the stop at once when the gentle stop fails', async () => {
    const stops: string[] = [];
    const deps = dependencies({
      graceMs: 10_000,
      stop: (pid, force) => {
        stops.push(`${force ? 'force' : 'term'} ${pid}`);
        return force ? Promise.resolve() : Promise.reject(new Error('This process can only be terminated forcefully'));
      },
      isFree: () => Promise.resolve(stops.includes('force 42')),
    });
    await expect(freePortOrAsk(port, deps)).resolves.toBeUndefined();
    expect(stops).toEqual(['term 42', 'force 42']);
  });

  it('reports a process it is not allowed to stop', async () => {
    const deps = dependencies({ stop: () => Promise.reject(new Error('permission denied (it may belong to another user)')), isFree: () => Promise.resolve(false) });
    await expect(freePortOrAsk(port, deps)).rejects.toThrow(
      `Could not stop node (pid 42): permission denied (it may belong to another user). Port ${port} is already in use by node (pid 42) (`,
    );
  });

  it('reports a port that stays busy after the stop', async () => {
    const deps = dependencies({ isFree: () => Promise.resolve(false) });
    await expect(freePortOrAsk(port, deps)).rejects.toThrow(`The port is still busy 0.03 s after stopping node (pid 42). Port ${port} is already in use by node (pid 42) (`);
    expect(deps.stops).toEqual(['term 42', 'force 42']);
  });
});

describe('stopProcess', () => {
  it('treats a process that is already gone as stopped', async () => {
    const child = spawn(process.execPath, ['-e', '']);
    await once(child, 'exit');
    if (child.pid === undefined) throw new Error('no pid');
    await expect(stopProcess(child.pid, false, 'linux')).resolves.toBeUndefined();
  });
});

function answering(keys: string): { input: FakeInput; logger: ReturnType<typeof recordingLogger> } {
  const input = new FakeInput();
  const logger = recordingLogger((message) => {
    if (!message.startsWith('Press Enter')) return;
    setImmediate(() => {
      input.press(keys);
    });
  });
  return { input, logger };
}

const withoutLsof = (file: string, args: readonly string[]) => (file === 'lsof' ? Promise.resolve(undefined) : runCommand(file, args));

describe.runIf(process.platform === 'linux')('a listener started by the test', () => {
  let child: ChildProcess | undefined;
  let server: Server | undefined;

  afterEach(async () => {
    if (server !== undefined) await closeServer(server);
    server = undefined;
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
    child = undefined;
  });

  async function startListener(port: number): Promise<ChildProcess> {
    const started = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${port}, '127.0.0.1', () => console.log('listening'))`], { stdio: ['ignore', 'pipe', 'inherit'] });
    child = started;
    await once(started.stdout, 'data');
    return started;
  }

  it('stops it on Enter, and the server can start on the port', async () => {
    const port = await freePort();
    const listener = await startListener(port);
    const exited = once(listener, 'exit');
    const { input, logger } = answering('\r');
    await terminalPortCheck({ logger, input, output: { isTTY: true } })(port);
    expect(logger.lines[0]).toMatch(new RegExp(`^Port ${port} is in use by node \\(pid ${listener.pid}\\): node -e require`));
    await exited;
    expect(listener.signalCode).toBe('SIGTERM');
    server = await listen(port);
    expect(input.isRaw).toBe(false);
  });

  it('leaves it running on Ctrl+C', async () => {
    const port = await freePort();
    const listener = await startListener(port);
    const { input, logger } = answering('\u0003');
    await expect(terminalPortCheck({ logger, input, output: { isTTY: true } })(port)).rejects.toThrow('Cancelled');
    expect(listener.exitCode).toBeNull();
    expect(listener.signalCode).toBeNull();
    expect(input.listenerCount('data')).toBe(0);
  });

  it('never prompts without a terminal', async () => {
    const port = await freePort();
    await startListener(port);
    const { input, logger } = answering('\r');
    await expect(terminalPortCheck({ logger, input, output: { isTTY: false } })(port)).rejects.toThrow(`Port ${port} is already in use (`);
    expect(logger.lines).toEqual([]);
    expect(input.rawModes).toEqual([]);
  });

  it('finds it with ss when lsof is not available', async () => {
    const port = await freePort();
    const listener = await startListener(port);
    const owner = await findPortOwner(port, { platform: 'linux', run: withoutLsof });
    expect(owner?.pid).toBe(listener.pid);
    expect(owner?.name).toBe('node');
  });
});
