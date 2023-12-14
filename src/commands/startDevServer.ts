import { Logger } from '../common/logger';
import { Settings2 } from '../common/settings';
import { spawnProcess } from '../common/spawnProcess';
import { needToRunBundle } from '../common/helpers';
import * as path from 'path';
import { initSettings, serveSettings } from '../common/settingsManager';

export async function startDevServer(settings: Settings2['serve']) {

  try {

    initSettings(settings);

    console.log(serveSettings);

    if (needToRunBundle()) {
      await spawnProcess('gulp', [`--gulpfile ${path.resolve(__dirname, 'templates/gulpfile.js')}`, `--cwd ${process.cwd()}`,'bundle', '--custom-serve', `--max-old-space-size=${serveSettings.memory}`]);
    }
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

  return await spawnProcess('node', [path.resolve(__dirname, '../webpack/devServer.js'), ...process.argv.slice(2)], env);
}
