import { createRequire } from 'node:module';
import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';
import type { PageChannel } from '../featureApi/index.js';
import type { Logger } from '../logger.js';
import { errorMessage } from '../utils/errors.js';
import { checkerOptions } from './checkerOptions.js';
import { createIssuesChangeDetector, typeCheckResult, type TypeCheckResult } from './issues.js';
import { scheduleChecks } from './schedule.js';

const PLUGIN_NAME = 'fast-serve:type-check';
const CHECKER_PACKAGE = 'ts-checker-rspack-plugin';
const OTHER_CHECKERS = new Set(['TsCheckerRspackPlugin', 'ForkTsCheckerWebpackPlugin']);

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
    hooks.issues.tap(PLUGIN_NAME, (issues) => {
      reportedErrors.clear();
      if (changed(issues)) {
        const result = typeCheckResult(issues, root);
        printTypeCheckResult(result, logger);
        onResult?.(result);
      }
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
