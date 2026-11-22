import { execFile } from 'node:child_process';
import path from 'node:path';

export interface PortOwner {
  pid: number;
  name?: string;
  command?: string;
}

export type CommandRunner = (file: string, args: readonly string[]) => Promise<string | undefined>;

export interface FindPortOwnerOptions {
  platform?: NodeJS.Platform;
  run?: CommandRunner;
  excludedPids?: readonly number[];
}

const COMMAND_TIMEOUT_MS = 3000;
const MAX_COMMAND_LENGTH = 120;

export const runCommand: CommandRunner = (file, args) =>
  new Promise((resolve) => {
    execFile(file, [...args], { timeout: COMMAND_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      resolve(error === null || stdout.trim() !== '' ? stdout : undefined);
    });
  });

export async function findPortOwner(port: number, { platform = process.platform, run = runCommand, excludedPids = [] }: FindPortOwnerOptions = {}): Promise<PortOwner | undefined> {
  const candidates = platform === 'win32' ? await windowsListeners(port, run) : await unixListeners(port, platform, run);
  const owner = candidates.find(({ pid }) => !excludedPids.includes(pid)) ?? candidates[0];
  if (owner === undefined) return undefined;
  return platform === 'win32' ? withWindowsName(owner, run) : withUnixCommand(owner, run);
}

async function windowsListeners(port: number, run: CommandRunner): Promise<PortOwner[]> {
  const output = await run('netstat', ['-ano']);
  return output === undefined ? [] : parseNetstat(output, port).map((pid) => ({ pid }));
}

async function unixListeners(port: number, platform: NodeJS.Platform, run: CommandRunner): Promise<PortOwner[]> {
  const lsof = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpcn']);
  const fromLsof = lsof === undefined ? [] : parseLsof(lsof);
  if (fromLsof.length > 0 || platform !== 'linux') return fromLsof;
  const ss = await run('ss', ['-ltnpH']);
  return ss === undefined ? [] : parseSs(ss, port);
}

async function withWindowsName(owner: PortOwner, run: CommandRunner): Promise<PortOwner> {
  const output = await run('tasklist', ['/FI', `PID eq ${owner.pid}`, '/FO', 'CSV', '/NH']);
  const name = output === undefined ? undefined : parseTasklist(output, owner.pid);
  return name === undefined ? owner : { ...owner, name };
}

async function withUnixCommand(owner: PortOwner, run: CommandRunner): Promise<PortOwner> {
  const output = await run('ps', ['-o', 'args=', '-p', String(owner.pid)]);
  const command = output?.trim();
  if (command === undefined || command === '') return owner;
  return { ...owner, name: executableName(command) ?? owner.name, command };
}

function executableName(command: string): string | undefined {
  const executable = command.split(/\s+/)[0];
  return executable === undefined || executable === '' ? undefined : path.basename(executable);
}

export function parseNetstat(output: string, port: number): number[] {
  const pids: number[] = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0]?.toUpperCase() !== 'TCP') continue;
    const [, local = '', foreign = '', state = ''] = columns;
    const pid = Number(columns.at(-1));
    const listening = state.toUpperCase() === 'LISTENING' || foreign.endsWith(':0');
    if (listening && localPort(local) === port && Number.isInteger(pid) && pid > 0 && !pids.includes(pid)) pids.push(pid);
  }
  return pids;
}

export function parseTasklist(output: string, pid: number): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    const fields = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? '');
    if (fields.length >= 2 && Number(fields[1]) === pid && fields[0] !== '') return fields[0];
  }
  return undefined;
}

export function parseLsof(output: string): PortOwner[] {
  const owners: PortOwner[] = [];
  let current: PortOwner | undefined;
  for (const line of output.split(/\r?\n/)) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') {
      const pid = Number(value);
      current = Number.isInteger(pid) && pid > 0 ? { pid } : undefined;
      if (current !== undefined) owners.push(current);
    } else if (field === 'c' && current !== undefined && value !== '') current.name = value;
  }
  return owners;
}

export function parseSs(output: string, port: number): PortOwner[] {
  const owners: PortOwner[] = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    const local = columns.find((column, index) => index > 0 && localPort(column) !== undefined);
    if (columns[0] !== 'LISTEN' || local === undefined || localPort(local) !== port) continue;
    for (const match of line.matchAll(/\("([^"]*)",pid=(\d+)/g)) {
      const pid = Number(match[2]);
      if (!owners.some((owner) => owner.pid === pid)) owners.push({ pid, ...(match[1] ? { name: match[1] } : {}) });
    }
  }
  return owners;
}

function localPort(address: string): number | undefined {
  const match = /:(\d+)$/.exec(address);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function describePortOwner({ pid, name }: PortOwner): string {
  return name === undefined ? `pid ${pid}` : `${name} (pid ${pid})`;
}

export function shortenCommand(command: string): string {
  const [executable = '', ...args] = command.trim().split(/\s+/);
  const singleLine = [path.basename(executable), ...args].join(' ');
  return singleLine.length <= MAX_COMMAND_LENGTH ? singleLine : `${singleLine.slice(0, MAX_COMMAND_LENGTH - 1)}…`;
}
