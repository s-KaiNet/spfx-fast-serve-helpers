import { describe, expect, it } from 'vitest';
import { describePortOwner, findPortOwner, parseLsof, parseNetstat, parseSs, parseTasklist, shortenCommand, type CommandRunner } from './portOwner.js';

const NETSTAT_EN = [
  '',
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1196',
  '  TCP    127.0.0.1:4321         0.0.0.0:0              LISTENING       5678',
  '  TCP    127.0.0.1:4321         127.0.0.1:50123        ESTABLISHED     5678',
  '  TCP    127.0.0.1:50123        127.0.0.1:4321         ESTABLISHED     9012',
  '  TCP    127.0.0.1:43210        0.0.0.0:0              LISTENING       3333',
  '  TCP    [::]:135               [::]:0                 LISTENING       1196',
  '  TCP    [::1]:4321             [::]:0                 LISTENING       5678',
  '  UDP    0.0.0.0:4321           *:*                                    7777',
].join('\r\n');

const NETSTAT_DE = [
  'Aktive Verbindungen',
  '',
  '  Proto  Lokale Adresse         Remoteadresse          Status           PID',
  '  TCP    [::1]:4321             [::]:0                 ABHÖREN          4444',
  '  TCP    127.0.0.1:4321         127.0.0.1:50999        HERGESTELLT      4444',
].join('\r\n');

const TASKLIST = '"node.exe","5678","Console","1","45,236 K"\r\n';
const TASKLIST_NONE = 'INFO: No tasks are running which match the specified criteria.\r\n';

const LSOF = ['p2084775', 'cMainThread', 'n127.0.0.1:4490', 'n[::1]:4490', 'p2084800', 'cnode', 'f23', 'n*:4490', ''].join('\n');

const SS = [
  'LISTEN 0      511                                127.0.0.1:35543 0.0.0.0:* users:(("MainThread",pid=1265996,fd=26))  ',
  'LISTEN 0      4096                 100.73.93.42%tailscale0:4490   0.0.0.0:*                                           ',
  'LISTEN 0      511                                127.0.0.1:4490  0.0.0.0:* users:(("MainThread",pid=2084775,fd=21))  ',
  'LISTEN 0      511                                    [::1]:4490     [::]:* users:(("node",pid=2084775,fd=22),("node",pid=2084801,fd=22))',
  'LISTEN 0      511                                    [::1]:44901    [::]:* users:(("other",pid=9,fd=22))',
].join('\n');

describe('parseNetstat', () => {
  it('finds listening pids for the port in IPv4 and IPv6 rows and ignores connections, other ports and UDP', () => {
    expect(parseNetstat(NETSTAT_EN, 4321)).toEqual([5678]);
    expect(parseNetstat(NETSTAT_EN, 135)).toEqual([1196]);
    expect(parseNetstat(NETSTAT_EN, 4490)).toEqual([]);
  });

  it('recognises listening rows by the wildcard foreign port when the state is localized', () => {
    expect(parseNetstat(NETSTAT_DE, 4321)).toEqual([4444]);
  });
});

describe('parseTasklist', () => {
  it('reads the image name of the pid and nothing from the "no tasks" message', () => {
    expect(parseTasklist(TASKLIST, 5678)).toBe('node.exe');
    expect(parseTasklist(TASKLIST, 1)).toBeUndefined();
    expect(parseTasklist(TASKLIST_NONE, 5678)).toBeUndefined();
  });
});

describe('parseLsof', () => {
  it('reads every process with its command name', () => {
    expect(parseLsof(LSOF)).toEqual([
      { pid: 2084775, name: 'MainThread' },
      { pid: 2084800, name: 'node' },
    ]);
    expect(parseLsof('')).toEqual([]);
  });
});

describe('parseSs', () => {
  it('reads the processes listening on the exact port, without duplicates', () => {
    expect(parseSs(SS, 4490)).toEqual([
      { pid: 2084775, name: 'MainThread' },
      { pid: 2084801, name: 'node' },
    ]);
    expect(parseSs(SS, 449)).toEqual([]);
  });
});

function fakeRunner(outputs: Record<string, string | undefined>): { run: CommandRunner; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    run: (file) => {
      calls.push(file);
      return Promise.resolve(outputs[file]);
    },
  };
}

describe('findPortOwner', () => {
  it('uses lsof and ps on Linux and names the process after its executable', async () => {
    const { run, calls } = fakeRunner({ lsof: LSOF, ps: '/usr/local/bin/node  server.js --port 4490\n' });
    await expect(findPortOwner(4490, { platform: 'linux', run })).resolves.toEqual({ pid: 2084775, name: 'node', command: '/usr/local/bin/node  server.js --port 4490' });
    expect(calls).toEqual(['lsof', 'ps']);
  });

  it('falls back to ss on Linux when lsof is missing or finds nothing', async () => {
    const { run, calls } = fakeRunner({ ss: SS });
    await expect(findPortOwner(4490, { platform: 'linux', run })).resolves.toEqual({ pid: 2084775, name: 'MainThread' });
    expect(calls).toEqual(['lsof', 'ss', 'ps']);
  });

  it('does not use ss on macOS', async () => {
    const { run, calls } = fakeRunner({ ss: SS });
    await expect(findPortOwner(4490, { platform: 'darwin', run })).resolves.toBeUndefined();
    expect(calls).toEqual(['lsof']);
  });

  it('uses netstat and tasklist on Windows', async () => {
    const { run, calls } = fakeRunner({ netstat: NETSTAT_EN, tasklist: TASKLIST });
    await expect(findPortOwner(4321, { platform: 'win32', run })).resolves.toEqual({ pid: 5678, name: 'node.exe' });
    expect(calls).toEqual(['netstat', 'tasklist']);
  });

  it('keeps the pid when the name lookup fails', async () => {
    const { run } = fakeRunner({ netstat: NETSTAT_EN, tasklist: TASKLIST_NONE });
    await expect(findPortOwner(4321, { platform: 'win32', run })).resolves.toEqual({ pid: 5678 });
  });

  it('prefers a process that is not excluded', async () => {
    const { run } = fakeRunner({ lsof: LSOF });
    await expect(findPortOwner(4490, { platform: 'linux', run, excludedPids: [2084775] })).resolves.toEqual({ pid: 2084800, name: 'node' });
  });
});

describe('describePortOwner and shortenCommand', () => {
  it('describes the owner with and without a name', () => {
    expect(describePortOwner({ pid: 7, name: 'node' })).toBe('node (pid 7)');
    expect(describePortOwner({ pid: 7 })).toBe('pid 7');
  });

  it('puts the command on one line and shortens it', () => {
    expect(shortenCommand('/usr/local/bin/node\n  server.js /srv/app')).toBe('node server.js /srv/app');
    const long = shortenCommand(`node ${'x'.repeat(300)}`);
    expect(long).toHaveLength(120);
    expect(long.endsWith('…')).toBe(true);
  });
});
