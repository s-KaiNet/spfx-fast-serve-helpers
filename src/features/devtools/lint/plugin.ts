import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { Logger } from '../../../shared/logger.js';
import type { LintRunner } from './runner.js';

const PLUGIN_NAME = 'fast-serve:lint';
const OTHER_LINTERS = new Set(['ESLintRspackPlugin', 'ESLintWebpackPlugin', 'ESLintPlugin']);

export function otherLinterName(plugins: readonly unknown[]): string | undefined {
  for (const plugin of plugins) {
    if (typeof plugin !== 'object' || plugin === null) continue;
    const name = (plugin as { constructor?: { name?: unknown } }).constructor?.name;
    if (typeof name === 'string' && OTHER_LINTERS.has(name)) return name;
  }
  return undefined;
}

export class LintPlugin implements RspackPluginInstance {
  private skippedFor: string | undefined;

  constructor(
    private readonly runner: LintRunner,
    private readonly logger: Logger,
  ) {}

  get skipped(): boolean {
    return this.skippedFor !== undefined;
  }

  apply(compiler: Compiler): void {
    this.skippedFor = otherLinterName(compiler.options.plugins);
    if (this.skippedFor !== undefined) {
      this.logger.info(`lint: using the ${this.skippedFor} from the Rspack extend file (fast-serve's own lint is skipped)`);
      return;
    }
    const { runner } = this;
    const started = () => {
      runner.compileStarted();
    };
    const finished = () => {
      runner.compileFinished();
    };
    compiler.hooks.invalid.tap(PLUGIN_NAME, started);
    compiler.hooks.watchRun.tap(PLUGIN_NAME, started);
    compiler.hooks.done.tap(PLUGIN_NAME, finished);
    compiler.hooks.failed.tap(PLUGIN_NAME, finished);
    compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
      runner.stop();
    });
  }
}
