#!/usr/bin/env node
/* eslint-disable no-console */

import * as path from 'path';
import { program, InvalidArgumentError, Option } from 'commander';
import { Logger } from './common/logger';
import { spawnProcess } from './common/spawnProcess';
import { getJSONFile, needToRunBundle } from './webpack/helpers';
import { NodePackage } from './common/types';
import { moduleName } from './common/consts';

const packageJson = getJSONFile<NodePackage>(`node_modules/${moduleName}/package.json`);

function myParseInt(value: string): number {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue;
}

program
  .name('fast-serve')
  .description('SPFx Fast Serve Tool')
  .option('-m, --memory <memory>', 'Memory limit for the dev server in MB', myParseInt, 8192)
  .option('-lc, --isLibraryComponent', 'Should be true, when running inside library component project type', false)
  .option('-l, --locale <locale-code>', 'Local code when running in a multi-language scenario', undefined)
  .option('-c, --config <config-name>', 'Serve configuration to run on a startup', undefined)
  .option('-o, --openUrl <url>', 'Url to open on a startup. If empty, no url will be opened', undefined)
  .addOption(new Option('-l, --loggingLevel <level>', 'Logging level, minimal notifies about errors and new builds only, normal adds bundle information, detailed adds details about each bundle').choices(['minimal', 'normal', 'detailed']).default('normal'))
  .option('-f, --fullScreenErrors', 'Whether to show full-screen (overlay) errors', true)
  .option('-e, --eslint', 'ESLint support', true)
  .option('-h, --hotRefresh', 'When true, enables webpack\'s Hot Module Replacement (HMR) feature', false)
  .option('-r, --reactProfiling', 'When true, enables react profiling mode through React Chrome extension', false)
  .option('-t, --containers', 'Explicitly enables containerized environment support', false)
  .option('-p, --port <port>', 'HTTP port to use to serve the bundles', myParseInt, 4321)
  .version(packageJson.version, '-v, --version', 'Output the fast-serve version');

const webpackCommand = program.command('webpack')
  .description('Webpack related commands');

webpackCommand.command('extend')
  .description('Adds fast-serve webpack extensibility file to the project')
  .action(async () => {
    Logger.log('create webpack extend file');
    process.exit(0);
  });

const configCommand = program.command('config')
  .description('Configuration related commands');

configCommand.command('add')
  .description('Adds fast-serve configuration file to the project')
  .action(async () => {
    Logger.log('create config file');
    process.exit(0);
  });

program.parse(process.argv);

(async () => {
  try {
    if (needToRunBundle()) {
      await spawnProcess('gulp', ['bundle', '--custom-serve', '--max-old-space-size=8192']);
    }
    await spawnDevServer();

  } catch (error) {
    if (error) {
      Logger.error(error?.message || error.toString());
      throw error;
    } else {
      Logger.error("The process exited with an error");
      process.exit(1);
    }
  }
})();

async function spawnDevServer(): Promise<void> {
  const env = { ...process.env };

  // https://stackoverflow.com/a/69699772/434967
  const nodeMajorVersion = parseInt(process.version.split('.')[0].substring(1), 10);
  if (nodeMajorVersion >= 17) {
    if (!env['NODE_OPTIONS']) {
      env['NODE_OPTIONS'] = '';
    }
    env['NODE_OPTIONS'] += ' --openssl-legacy-provider';
  }

  return await spawnProcess('node', [path.resolve(__dirname, `webpack/devServer.js`), ...process.argv.slice(2)], env);
}
