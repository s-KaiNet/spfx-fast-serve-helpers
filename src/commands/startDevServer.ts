import { Logger } from '../common/logger';
import { Settings } from '../common/settings';
import { spawnProcess } from '../common/spawnProcess';
import { hrtime } from 'process';
import { nanoToSeconds, needToRunBundle } from '../common/helpers';
import * as path from 'path';
import { initSettingsFromCli, serveSettings } from '../common/settingsManager';

export async function startDevServer(settings: Settings['serve']) {
  try {

    initSettingsFromCli(settings);

    Logger.debug('Running fast-serve in debug mode');
    Logger.debugEnvironmentInfo();

    await spawnSpfxBundle();
    await spawnDevServer();

  } catch (error) {
    if (error) {
      Logger.error(error?.message || error.toString());
      throw error;
    } else {
      Logger.error('The process terminated unexpectedly');
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

  const bundleArgs = ['bundle', '--custom-serve'];

  if (serveSettings.locale) {
    bundleArgs.push(`--locale=${serveSettings.locale}`);
  }

  bundleArgs.push(`--max-old-space-size=${serveSettings.memory}`);

  await spawnProcess('gulp', bundleArgs);

  const endTime = hrtime.bigint();

  Logger.debug(`Finished SPFx bundle in ${nanoToSeconds(endTime - startTime)}s`);
}

async function spawnDevServer(): Promise<void> {
  const env = { ...process.env };

  if (!env['NODE_OPTIONS']) {
    env['NODE_OPTIONS'] = '';
  }
  env['NODE_OPTIONS'] += ` --max-old-space-size=${serveSettings.memory}`;

  // https://stackoverflow.com/a/69699772/434967
  const nodeMajorVersion = parseInt(process.version.split('.')[0].substring(1), 10);
  if (nodeMajorVersion >= 17) {
    env['NODE_OPTIONS'] += ' --openssl-legacy-provider';
  }

  return await spawnProcess('node', [path.resolve(__dirname, '../webpack/devServer.js'), '--config', JSON.stringify(serveSettings)], env);
}
