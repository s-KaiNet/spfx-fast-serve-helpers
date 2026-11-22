import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FileLintResult, LintMessage, LintMode, WorkerRequest, WorkerResponse, WorkerRoot } from './protocol.js';

export type FlatConfig = Record<string, unknown>;

export interface CalculatedConfig {
  readonly rules?: Record<string, unknown>;
  readonly plugins?: Record<string, { readonly rules?: Record<string, { readonly meta?: { readonly docs?: { readonly requiresTypeChecking?: boolean } } }> }>;
}

interface EslintMessage {
  readonly line?: number;
  readonly column?: number;
  readonly severity: number;
  readonly ruleId: string | null;
  readonly message: string;
  readonly fatal?: boolean;
}

interface EslintResult {
  readonly filePath: string;
  readonly messages: readonly EslintMessage[];
}

interface EslintInstance {
  isPathIgnored(file: string): Promise<boolean>;
  calculateConfigForFile(file: string): Promise<CalculatedConfig | undefined>;
  lintFiles(files: string[]): Promise<EslintResult[]>;
  lintText(text: string, options: { filePath: string }): Promise<EslintResult[]>;
}

type EslintClass = new (options: Record<string, unknown>) => EslintInstance;

interface EslintModule {
  loadESLint?: (options: { useFlatConfig: boolean }) => Promise<EslintClass>;
  ESLint?: EslintClass;
}

export const TYPESCRIPT_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
export const LINTED_FILES = [...TYPESCRIPT_FILES, '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];
export const NO_TYPE_INFORMATION = { parserOptions: { project: false, projectService: false, program: null } };
const DISABLE_TYPE_CHECKED_SOURCES = [
  { request: '@typescript-eslint/eslint-plugin', config: (module: unknown) => configAt(module, ['configs', 'flat/disable-type-checked']) },
  { request: 'typescript-eslint', config: (module: unknown) => configAt(module, ['configs', 'disableTypeChecked']) },
];
const PLUGIN_ANCHORS = ['@microsoft/eslint-config-spfx', 'typescript-eslint', '@rushstack/eslint-config'];
const TYPE_INFORMATION_ERROR = /requires (?:type information|parserServices)/;
const RULE_IN_ERROR = /Error while loading rule '([^']+)'/;
const IGNORED_FILE_MESSAGE = /^File ignored\b/;
const MAX_TYPE_AWARE_RETRIES = 20;
const WARM_FILE = /\.(?:tsx?|jsx?)$/;

export function ruleSeverity(setting: unknown): number {
  const value = Array.isArray(setting) ? (setting[0] as unknown) : setting;
  if (value === 'error' || value === 2) return 2;
  if (value === 'warn' || value === 1) return 1;
  return 0;
}

export function typeAwareRules(config: CalculatedConfig | undefined): string[] {
  const found: string[] = [];
  for (const [ruleId, setting] of Object.entries(config?.rules ?? {})) {
    if (ruleSeverity(setting) === 0) continue;
    const slash = ruleId.lastIndexOf('/');
    if (slash <= 0) continue;
    const rule = config?.plugins?.[ruleId.slice(0, slash)]?.rules?.[ruleId.slice(slash + 1)];
    if (rule?.meta?.docs?.requiresTypeChecking === true) found.push(ruleId);
  }
  return found;
}

export function typeInformationRule(message: string): string | undefined {
  if (!TYPE_INFORMATION_ERROR.test(message)) return undefined;
  return RULE_IN_ERROR.exec(message)?.[1];
}

export function skipTypeAwareConfig(disableTypeChecked: FlatConfig | undefined, offRules: Iterable<string>): FlatConfig[] {
  const rules = Object.fromEntries([...offRules].toSorted().map((ruleId) => [ruleId, 'off']));
  return [
    ...(disableTypeChecked === undefined ? [] : [{ ...disableTypeChecked, files: TYPESCRIPT_FILES }]),
    { files: TYPESCRIPT_FILES, languageOptions: NO_TYPE_INFORMATION },
    ...(Object.keys(rules).length === 0 ? [] : [{ files: LINTED_FILES, rules }]),
  ];
}

export function toFileResult(result: EslintResult): FileLintResult {
  const { filePath: file, messages } = result;
  if (messages.some((message) => message.fatal === true)) return { file, status: 'unparsable' };
  if (messages.length === 1 && messages[0]?.ruleId === null && IGNORED_FILE_MESSAGE.test(messages[0].message)) return { file, status: 'ignored' };
  return { file, status: 'linted', messages: messages.map(toLintMessage) };
}

function toLintMessage({ line, column, severity, ruleId, message }: EslintMessage): LintMessage {
  return { line: line ?? 0, column: column ?? 0, severity: severity >= 2 ? 'error' : 'warning', ruleId: ruleId ?? undefined, message };
}

function configAt(module: unknown, keys: readonly string[]): FlatConfig | undefined {
  let current: unknown = module;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'object' && current !== null ? (current as FlatConfig) : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function importFrom(file: string): Promise<unknown> {
  const imported = (await import(pathToFileURL(file).href)) as { default?: unknown };
  return imported.default ?? imported;
}

function resolveFrom(root: string, request: string): string | undefined {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  const candidates = [projectRequire, ...PLUGIN_ANCHORS.flatMap((anchor) => {
    const anchorFile = tryResolve(projectRequire, `${anchor}/package.json`);
    return anchorFile === undefined ? [] : [createRequire(anchorFile)];
  })];
  for (const candidate of candidates) {
    const resolved = tryResolve(candidate, request);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

function tryResolve(candidate: NodeJS.Require, request: string): string | undefined {
  try {
    return candidate.resolve(request);
  } catch {
    return undefined;
  }
}

async function disableTypeCheckedFor(root: string): Promise<FlatConfig | undefined> {
  const candidates = await Promise.all(
    DISABLE_TYPE_CHECKED_SOURCES.map(async ({ request, config }) => {
      const file = resolveFrom(root, request);
      if (file === undefined) return undefined;
      try {
        return config(await importFrom(file));
      } catch {
        return undefined;
      }
    }),
  );
  return candidates.find((candidate) => candidate !== undefined);
}

function firstSourceFile(sourceDir: string): string | undefined {
  try {
    const entries = readdirSync(sourceDir, { recursive: true, encoding: 'utf8' });
    const found = entries.find((entry) => WARM_FILE.test(entry) && !entry.endsWith('.d.ts') && !entry.split(/[\\/]/).includes('node_modules'));
    return found === undefined ? undefined : path.join(sourceDir, found);
  } catch {
    return undefined;
  }
}

class RootLinter {
  private eslint: Promise<EslintInstance> | undefined;
  private disableTypeChecked: Promise<FlatConfig | undefined> | undefined;
  private readonly offRules = new Set<string>();
  private readonly setup: WorkerRoot;
  private readonly mode: LintMode;

  constructor(setup: WorkerRoot, mode: LintMode) {
    this.setup = setup;
    this.mode = mode;
  }

  async loadConfig(): Promise<string | undefined> {
    const file = firstSourceFile(this.setup.sourceDir);
    const eslint = await this.instance();
    if (file === undefined || (await eslint.isPathIgnored(file))) return undefined;
    await this.skipTypeAwareRulesOf([file]);
    return file;
  }

  async warmRules(file: string): Promise<void> {
    await this.withTypeAwareRetries(async (eslint) => {
      await eslint.lintText(readFileSync(file, 'utf8'), { filePath: file });
    });
  }

  async lint(files: readonly string[]): Promise<FileLintResult[]> {
    return this.withTypeAwareRetries(async (eslint) => {
      const ignoredFlags = await Promise.all(files.map((file) => eslint.isPathIgnored(file)));
      const ignored = files.filter((_file, index) => ignoredFlags[index] === true).map((file): FileLintResult => ({ file, status: 'ignored' }));
      const linted = files.filter((_file, index) => ignoredFlags[index] !== true);
      await this.skipTypeAwareRulesOf(linted);
      const results = linted.length === 0 ? [] : await (await this.instance()).lintFiles(linted);
      return [...ignored, ...results.map(toFileResult)];
    });
  }

  private async skipTypeAwareRulesOf(files: readonly string[]): Promise<void> {
    if (this.mode === 'full' || files.length === 0) return;
    const eslint = await this.instance();
    const configs = await Promise.all(files.map((file) => eslint.calculateConfigForFile(file)));
    const found = [...new Set(configs.flatMap(typeAwareRules))].filter((ruleId) => !this.offRules.has(ruleId));
    if (found.length === 0) return;
    for (const ruleId of found) this.offRules.add(ruleId);
    this.eslint = undefined;
  }

  private async withTypeAwareRetries<T>(work: (eslint: EslintInstance) => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await work(await this.instance());
    } catch (error) {
      const ruleId = this.mode === 'full' ? undefined : typeInformationRule(errorText(error));
      if (ruleId === undefined || this.offRules.has(ruleId) || attempt >= MAX_TYPE_AWARE_RETRIES) throw error;
      this.offRules.add(ruleId);
      this.eslint = undefined;
      return this.withTypeAwareRetries(work, attempt + 1);
    }
  }

  private instance(): Promise<EslintInstance> {
    this.eslint ??= this.create();
    return this.eslint;
  }

  private async create(): Promise<EslintInstance> {
    const { root, eslintPath, cacheLocation } = this.setup;
    const module = (await import(pathToFileURL(eslintPath).href)) as EslintModule;
    const Eslint = (await module.loadESLint?.({ useFlatConfig: true })) ?? module.ESLint;
    if (Eslint === undefined) throw new Error(`${eslintPath} has no ESLint class`);
    const overrideConfig = this.mode === 'full' ? undefined : skipTypeAwareConfig(await (this.disableTypeChecked ??= disableTypeCheckedFor(root)), this.offRules);
    return new Eslint({
      cwd: root,
      cache: true,
      cacheLocation,
      cacheStrategy: 'content',
      errorOnUnmatchedPattern: false,
      ...(overrideConfig === undefined ? {} : { overrideConfig }),
    });
  }
}

function send(response: WorkerResponse): void {
  if (process.connected) process.send?.(response);
}

function runWorker(): void {
  const linters = new Map<string, RootLinter>();
  const broken = new Set<string>();
  let queue = Promise.resolve();

  const reportFailure = (root: string, error: unknown, fatal: boolean) => {
    if (fatal) broken.add(root);
    send({ type: 'problem', root, message: errorText(error), fatal });
  };

  const handle = async (request: WorkerRequest) => {
    if (request.type === 'setup') {
      for (const root of request.roots) linters.set(root.root, new RootLinter(root, request.mode));
      return;
    }
    if (request.type === 'warm') {
      await Promise.all(
        [...linters].map(async ([root, linter]) => {
          const startedAt = performance.now();
          let file: string | undefined;
          try {
            file = await linter.loadConfig();
          } catch (error) {
            reportFailure(root, error, true);
            return;
          }
          if (file !== undefined) await linter.warmRules(file).catch(() => undefined);
          send({ type: 'warmed', root, durationMs: Math.round(performance.now() - startedAt) });
        }),
      );
      return;
    }
    const startedAt = performance.now();
    const linter = linters.get(request.root);
    let results: FileLintResult[] = [];
    if (linter !== undefined && !broken.has(request.root)) {
      try {
        results = await linter.lint(request.files);
      } catch (error) {
        reportFailure(request.root, error, false);
      }
    }
    send({ type: 'linted', id: request.id, results, durationMs: Math.round(performance.now() - startedAt) });
  };

  process.on('message', (request: WorkerRequest) => {
    queue = queue.then(() => handle(request));
  });
  process.on('SIGINT', () => undefined);
  process.on('disconnect', () => {
    process.exit(0);
  });
}

export const WORKER_FLAG = '--fast-serve-lint-worker';

if (process.argv.includes(WORKER_FLAG)) runWorker();
