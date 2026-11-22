import path from 'node:path';
import type { ConfigContribution, Feature, FeatureContext } from '../featureApi/index.js';
import { errorMessage } from '../utils/errors.js';
import { toPosix } from '../utils/paths.js';
import { watchSourceFolder, type SourceWatcher } from '../utils/sourceWatcher.js';
import { watchEslintConfigs, type ConfigWatcher } from './configWatcher.js';
import { LintPlugin } from './plugin.js';
import { findProjectEslint } from './projectEslint.js';
import type { LintMode } from './protocol.js';
import { createLintRunner, type LintRoot, type LintRunner } from './runner.js';

export { isLintedFile, sourceRootOf } from './lintFiles.js';
export { LintPlugin, otherLinterName } from './plugin.js';
export { ESLINT_CONFIG_FILES, findProjectEslint, type ProjectEslint } from './projectEslint.js';
export type { FileLintResult, LintMessage, LintMode } from './protocol.js';
export { createLintReport, formatFileMessages, lintCounts, MAX_LISTED_MESSAGES, messagesKey, type LintOutput, type LintReport } from './report.js';
export { createLintRunner, LINT_DELAY_MS, lintCacheFile, type LintRoot, type LintRunner, type LintRunnerOptions } from './runner.js';

export const lintFeature: Feature = { name: 'lint', contribute: lintContribution };

function lintContribution({ root, project, options, logger, page }: FeatureContext): ConfigContribution {
  const setting = options.lint ?? false;
  if (setting === false) return {};
  const roots: LintRoot[] = [];
  for (const codeRoot of project.codeRoots()) {
    const eslint = findProjectEslint(codeRoot.root);
    if (eslint.found) roots.push({ label: codeRoot.label, root: codeRoot.root, sourceDir: codeRoot.sourceDir, eslintPath: eslint.eslintPath, configFile: eslint.configFile });
    else if (codeRoot.root === root) logger.info(`lint is off: ${eslint.reason}`);
    else logger.info(`lint: ${codeRoot.label} is not linted: ${eslint.reason}`);
  }
  if (roots.length === 0) return {};
  const mode: LintMode = setting === 'full' ? 'full' : 'skip-type-aware';
  const runner = createLintRunner({ root, roots, mode, logger });
  const plugin = new LintPlugin(runner, logger);
  page.onServerStarted((server) => {
    if (plugin.skipped) return;
    let watchers: (SourceWatcher | ConfigWatcher)[] = [];
    let stopped = false;
    void server.firstCompile.then(() => {
      if (stopped) return;
      runner.start();
      watchers = startWatchers(root, roots, runner, logger);
    });
    server.onStop(() => {
      stopped = true;
      for (const watcher of watchers) watcher.close();
      runner.stop();
    });
  });
  return { plugins: [plugin] };
}

function startWatchers(root: string, roots: readonly LintRoot[], runner: LintRunner, logger: FeatureContext['logger']): (SourceWatcher | ConfigWatcher)[] {
  const sources = roots.map((lintRoot) =>
    watchSourceFolder(
      lintRoot.sourceDir,
      (changes) => {
        for (const { file, exists } of changes) runner.fileChanged(file, exists);
      },
      (error) => {
        logger.warn(`lint: saved files in ${lintRoot.label} are not linted anymore: ${errorMessage(error)}`);
      },
    ),
  );
  const configs = watchEslintConfigs(
    roots.map((lintRoot) => lintRoot.root),
    (file) => {
      runner.reload(`${toPosix(path.relative(root, file))} changed`);
    },
    (error) => {
      logger.warn(`lint: ESLint config changes are not picked up anymore: ${errorMessage(error)}`);
    },
  );
  return [...sources, configs];
}
