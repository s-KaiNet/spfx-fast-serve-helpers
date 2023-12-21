#!/usr/bin/env node

import { program, Option } from 'commander';
import { customParseBoolean, customParseInt, getJSONFile } from './common/helpers';
import { NodePackage } from './common/types';
import { fastServemoduleName } from './common/consts';
import { startDevServer } from './commands/startDevServer';
import { createWebpackExtend } from './commands/createWebpackExtend';
import { createConfigFile } from './commands/createConfigFile';

const packageJson = getJSONFile<NodePackage>(`node_modules/${fastServemoduleName}/package.json`);

program
  .name('fast-serve')
  .description('SPFx Fast Serve Tool')
  .option('-p, --port <port>', 'HTTP port to use to serve the bundles', customParseInt, 4321)
  .option('-m, --memory <memory>', 'Memory limit for the dev server in MB', customParseInt, 8192)
  .option('-l, --isLibraryComponent [value]', 'Should be true, when running inside library component project type', customParseBoolean, false)
  .option('-i, --locale <locale-code>', 'Local code when running in a multi-language scenario', undefined)
  .option('-c, --config <config-name>', 'Serve configuration to run on a startup', undefined)
  .option('-o, --openUrl <url>', 'Url to open on a startup. If empty, no url will be opened', undefined)
  .addOption(new Option('-l, --loggingLevel <level>', 'Logging level, "minimal" notifies about errors and new builds only, "normal" adds bundle information, "detailed" displays maximum information about each bundle').choices(['minimal', 'normal', 'detailed']).default('normal'))
  .option('-f, --fullScreenErrors [value]', 'Whether to show full-screen (overlay) errors', customParseBoolean, true)
  .option('-e, --eslint [value]', 'ESLint support', customParseBoolean, true)
  .option('-r, --hotRefresh  [value]', 'When true, enables webpack\'s Hot Module Replacement (HMR) feature, more info - https://github.com/s-KaiNet/spfx-fast-serve/blob/master/docs/HMR.md', customParseBoolean, false)
  .option('-r, --reactProfiling  [value]', 'When true, enables react profiling mode through React Chrome extension', customParseBoolean, false)
  .option('-t, --containers [value]', 'Explicitly enables containerized environment support', customParseBoolean, false)
  .option('-d, --debug [value]', 'Enables debug logging for fast-serve. In debug mode it prints more information about execution context', customParseBoolean, false)
  .version(packageJson.version, '-v, --version', 'Output the fast-serve version')
  .helpOption('-h, --help', 'Display help for command')
  .action(startDevServer);

const webpackCommand = program.command('webpack')
  .description('Webpack related commands');

webpackCommand.command('extend')
  .description('Adds fast-serve webpack extensibility file to the project')
  .option('-f, --force', 'Forces to overwrite existing file', false)
  .action(createWebpackExtend);

const configCommand = program.command('config')
  .description('Configuration related commands');

configCommand.command('add')
  .description('Adds fast-serve configuration file to the project')
  .option('-f, --force', 'Forces to overwrite existing file', false)
  .action(createConfigFile);

program.parse(process.argv);

