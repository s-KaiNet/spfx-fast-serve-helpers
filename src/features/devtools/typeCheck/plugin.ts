import { createRequire } from 'node:module';
import path from 'node:path';
import type { Compiler, RspackPluginInstance, Stats } from '@rspack/core';
import type { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';
import type { PageChannel } from '../../../bundler/featureApi/index.js';
import type { Logger } from '../../../shared/logger.js';
import { errorMessage } from '../../../shared/errors.js';
import { checkerOptions } from './checkerOptions.js';
import { createIssuesChangeDetector, issuesOutside, typeCheckResult, type TypeCheckResult, type TypeIssue } from './issues.js';
import { scheduleChecks } from './schedule.js';

const PLUGIN_NAME = 'fast-serve:type-check';
const CHECKER_PACKAGE = 'ts-checker-rspack-plugin';
const OTHER_CHECKERS = new Set(['TsCheckerRspackPlugin', 'ForkTsCheckerWebpackPlugin']);
const MODULE_BUILD_ERROR = 'ModuleBuildError';

export interface TypeCheckPluginOptions {
  root: string;
  typescriptPath: string;
  logger: Logger;
  page: Pick<PageChannel, 'onTypingsUpdated'>;
  onResult?: (result: TypeCheckResult) => void;
}

export function otherCheckerName(plugins: readonly unknown[]): string | undefined {
  for (const plugin of plugins) {
    if (typeof plugin !== 'object' || plugin === null) continue;
    const name = (plugin as { constructor?: { name?: unknown } }).constructor?.name;
    if (typeof name === 'string' && OTHER_CHECKERS.has(name)) return name;
  }
  return undefined;
}

export function filesTheCompilerCannotBuild(stats: Pick<Stats, 'compilation'>): Set<string> {
  const files = new Set<string>();
  for (const error of stats.compilation.errors) {
    const resource = error.name === MODULE_BUILD_ERROR ? (error.module as { resource?: unknown } | undefined)?.resource : undefined;
    if (typeof resource === 'string') files.add(path.normalize(resource.replace(/\?.*$/, '')));
  }
  return files;
}

function addsFiles(next: ReadonlySet<string>, previous: ReadonlySet<string>): boolean {
  return [...next].some((file) => !previous.has(file));
}

function loadChecker(): typeof TsCheckerRspackPlugin {
  const required = createRequire(import.meta.url)(CHECKER_PACKAGE) as { TsCheckerRspackPlugin: typeof TsCheckerRspackPlugin };
  return required.TsCheckerRspackPlugin;
}

export function printTypeCheckResult({ errors, summary, blocks }: TypeCheckResult, logger: Logger): void {
  const printBlock = errors > 0 ? logger.error : logger.warn;
  for (const block of blocks) printBlock(block);
  (errors > 0 ? logger.error : logger.info)(summary);
}

export class TypeCheckPlugin implements RspackPluginInstance {
  constructor(private readonly options: TypeCheckPluginOptions) {}

  apply(compiler: Compiler): void {
    const { root, typescriptPath, logger, page, onResult } = this.options;
    const other = otherCheckerName(compiler.options.plugins);
    if (other !== undefined) {
      logger.info(`type check: using the ${other} from the Rspack extend file (fast-serve's own type check is skipped)`);
      return;
    }
    const Checker = loadChecker();
    new Checker(checkerOptions(root, typescriptPath)).apply(compiler);
    const hooks = Checker.getCompilerHooks(compiler);
    const schedule = scheduleChecks(compiler, hooks, page);
    const changed = createIssuesChangeDetector();
    const reportedErrors = new Set<string>();
    let unbuildableFiles = new Set<string>();
    let lastIssues: readonly TypeIssue[] | undefined;
    const report = (issues: readonly TypeIssue[]) => {
      const shown = issuesOutside(issues, unbuildableFiles);
      if (!changed(shown)) return;
      const result = typeCheckResult(shown, root);
      printTypeCheckResult(result, logger);
      onResult?.(result);
    };
    compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
      const files = filesTheCompilerCannotBuild(stats);
      const added = addsFiles(files, unbuildableFiles);
      unbuildableFiles = files;
      if (added && lastIssues !== undefined) report(lastIssues);
    });
    hooks.issues.tap(PLUGIN_NAME, (issues) => {
      reportedErrors.clear();
      lastIssues = issues;
      report(issues);
      return issues;
    });
    hooks.error.tap(PLUGIN_NAME, (error) => {
      const message = errorMessage(error);
      if (schedule.closed() || reportedErrors.has(message)) return;
      reportedErrors.add(message);
      logger.error(`type check stopped: ${message}`);
    });
  }
}
