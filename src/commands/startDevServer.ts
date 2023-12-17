import { Logger } from '../common/logger';
import { Settings } from '../common/settings';
import { spawnProcess } from '../common/spawnProcess';
import { hrtime } from 'process';
import { getTemplatesPath, nanoToSeconds, needToRunBundle } from '../common/helpers';
import * as path from 'path';
import { replaceInFile, ReplaceInFileConfig } from 'replace-in-file';
import { copyFile, readFile } from 'fs/promises';
import { initSettingsFromCli, serveSettings } from '../common/settingsManager';
import { program } from 'commander';

export async function startDevServer(settings: Settings['serve']) {
  try {

    initSettingsFromCli(settings);

    Logger.debug('Running fast-serve in debug mode');
    Logger.debug(`fast-serve: ${program.version()}`, `node: ${process.version}`, `platform: ${process.platform}`);

    Logger.debug('Settings:', serveSettings);

    await spawnSpfxBundle();
    await spawnDevServer();

  } catch (error) {
    if (error) {
      Logger.error(error?.message || error.toString());
      throw error;
    } else {
      Logger.error('The process exited with an error');
      process.exit(1);
    }
  }
}

async function spawnSpfxBundle(): Promise<void> {
  if (!needToRunBundle()) {
    Logger.debug('Skipping bundle');
    return;
  }

  Logger.debug('Running SPFx bundle');

  const startTime = hrtime.bigint();
  const workDir = process.cwd();
  const gulpfile = path.resolve(workDir, 'gulpfile.js');
  const gulpfileTemp = path.resolve(workDir, 'temp/gulpfile.js');
  await copyFile(gulpfile, gulpfileTemp);

  const replaceContent = (await readFile(getTemplatesPath('gulpfile.js'))).toString();
  const hasFastServe = (await readFile(gulpfileTemp)).toString().includes('addFastServe(build)');

  if (!hasFastServe) {
    const replaceOpts: ReplaceInFileConfig = {
      files: gulpfileTemp,
      from: /build\.initialize.*;/g,
      to: replaceContent,
      glob: {
        windowsPathsNoEscape: true
      }
    };

    await replaceInFile(replaceOpts);

    Logger.debug('Added fast-serve to temp/gulpfile.js');
  }

  await spawnProcess('gulp', ['--gulpfile', `${path.resolve(workDir, 'temp/gulpfile.js')}`, '--cwd', workDir, 'bundle', '--custom-serve']);

  const endTime = hrtime.bigint();

  Logger.debug(`Finished SPFx bundle in ${nanoToSeconds(endTime - startTime)}s`);
}

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

  return await spawnProcess('node', [path.resolve(__dirname, '../webpack/devServer.js'), '--config', JSON.stringify(serveSettings)], env);
}
