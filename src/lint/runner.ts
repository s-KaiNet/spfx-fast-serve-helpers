import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../shared/logger.js';
import { packageFile } from '../shared/packageFile.js';
import { toPosix } from '../shared/paths.js';
import { isLintedFile, sourceRootOf, type SourceRoot } from './lintFiles.js';
import type { FileLintResult, LintMode, WorkerRequest, WorkerResponse, WorkerRoot } from './protocol.js';
import { createLintReport } from './report.js';
import { WORKER_FLAG } from './worker.js';

export const LINT_DELAY_MS = 50;
const STDERR_TAIL_LENGTH = 2000;
const CACHE_FOLDER = path.join('temp', 'fast-serve', 'eslint');

export interface LintRoot extends SourceRoot {
  readonly label: string;
  readonly eslintPath: string;
  readonly configFile: string;
}

export interface LintRunnerOptions {
  readonly root: string;
  readonly roots: readonly LintRoot[];
  readonly mode: LintMode;
  readonly logger: Logger;
  readonly delayMs?: number;
}

export interface LintRunner {
  start(): void;
  fileChanged(file: string, exists: boolean): void;
  compileStarted(): void;
  compileFinished(): void;
  reload(reason: string): void;
  stop(): void;
}

export function lintCacheFile(root: string, label: string, mode: LintMode): string {
  const slug = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
  return path.join(root, CACHE_FOLDER, `${slug}-${mode}.cache`);
}

function workerRoot(root: string, mode: LintMode, { label, root: lintRoot, sourceDir, eslintPath }: LintRoot): WorkerRoot {
  return { root: lintRoot, sourceDir, eslintPath, cacheLocation: lintCacheFile(root, label, mode) };
}

export function createLintRunner({ root, roots, mode, logger, delayMs = LINT_DELAY_MS }: LintRunnerOptions): LintRunner {
  const report = createLintReport(root);
  const pending = new Set<string>();
  const reportedProblems = new Set<string>();
  let child: ChildProcess | undefined;
  let compiling = false;
  let inFlight = 0;
  let nextId = 0;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let crashed = false;

  const ownerOf = (lintRoot: string) => roots.find((candidate) => candidate.root === lintRoot);

  const reportProblem = (lintRoot: string, message: string, fatal: boolean) => {
    const key = `${lintRoot}\n${message}`;
    if (reportedProblems.has(key)) return;
    reportedProblems.add(key);
    const owner = ownerOf(lintRoot);
    const config = owner === undefined ? 'its ESLint config' : toPosix(path.relative(root, owner.configFile));
    logger.error(fatal ? `lint: ESLint could not load ${config}, linting ${owner?.label ?? lintRoot} is off until the file changes:\n${message}` : `lint: ESLint failed: ${message}`);
  };

  const handleResults = (results: readonly FileLintResult[]) => {
    for (const result of results) {
      const output = report.update(result);
      if (output !== undefined) logger[output.level](output.text);
    }
  };

  const onMessage = (response: WorkerResponse) => {
    if (response.type === 'problem') reportProblem(response.root, response.message, response.fatal);
    else if (response.type === 'linted') {
      inFlight = Math.max(0, inFlight - 1);
      handleResults(response.results);
      if (inFlight === 0 && pending.size > 0) schedule(0);
    }
  };

  const spawn = (): ChildProcess | undefined => {
    if (stopped || crashed) return undefined;
    if (child !== undefined) return child;
    for (const lintRoot of roots) mkdirSync(path.dirname(lintCacheFile(root, lintRoot.label, mode)), { recursive: true });
    const started = fork(packageFile('./worker', import.meta.url), [WORKER_FLAG], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [], serialization: 'json' });
    let stderrTail = '';
    started.stderr?.setEncoding('utf8');
    started.stderr?.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LENGTH);
    });
    started.on('message', onMessage);
    started.on('error', () => undefined);
    started.on('exit', (code, signal) => {
      if (child !== started) return;
      child = undefined;
      inFlight = 0;
      if (stopped) return;
      crashed = true;
      const details = stderrTail.trim() === '' ? '' : `:\n${stderrTail.trim()}`;
      logger.error(`lint stopped: the ESLint process exited (${signal ?? `code ${code ?? 'unknown'}`}); linting is off until fast-serve restarts${details}`);
    });
    child = started;
    send({ type: 'setup', mode, roots: roots.map((lintRoot) => workerRoot(root, mode, lintRoot)) });
    return started;
  };

  const send = (request: WorkerRequest) => {
    if (child?.connected === true) child.send(request);
  };

  const flush = () => {
    timer = undefined;
    if (compiling || inFlight > 0 || pending.size === 0 || spawn() === undefined) return;
    const byRoot = new Map<string, string[]>();
    for (const file of pending) {
      const owner = sourceRootOf(file, roots);
      if (owner === undefined) continue;
      byRoot.set(owner.root, [...(byRoot.get(owner.root) ?? []), file]);
    }
    pending.clear();
    for (const [lintRoot, files] of byRoot) {
      inFlight += 1;
      nextId += 1;
      send({ type: 'lint', id: nextId, root: lintRoot, files: files.toSorted() });
    }
  };

  const schedule = (delay: number) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  };

  const kill = () => {
    clearTimeout(timer);
    timer = undefined;
    const running = child;
    child = undefined;
    inFlight = 0;
    running?.kill();
  };

  return {
    start() {
      if (spawn() !== undefined) send({ type: 'warm' });
    },
    fileChanged(file, exists) {
      if (stopped || crashed || !isLintedFile(file) || sourceRootOf(file, roots) === undefined) return;
      if (!exists) {
        pending.delete(file);
        report.forget(file);
        return;
      }
      pending.add(file);
      schedule(delayMs);
    },
    compileStarted() {
      compiling = true;
    },
    compileFinished() {
      compiling = false;
      if (pending.size > 0) schedule(0);
    },
    reload(reason) {
      if (stopped) return;
      kill();
      crashed = false;
      reportedProblems.clear();
      logger.info(`lint: ${reason}, reloading ESLint`);
      if (spawn() !== undefined) send({ type: 'warm' });
      if (pending.size > 0) schedule(0);
    },
    stop() {
      stopped = true;
      pending.clear();
      kill();
    },
  };
}
