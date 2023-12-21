/* eslint-disable no-console */
import colors from 'colors';

import { resultConfig } from './configureWebPack';
import Webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { Logger } from '../common/logger';
import { program } from 'commander';
import { applySettings } from '../common/settingsManager';

program.option('--config <config>').parse();
const settings = JSON.parse(program.opts().config);

applySettings(settings);

export async function startDevServer() {
  try {
    const config = await resultConfig();

    const compiler = Webpack(config);
    const server = new WebpackDevServer(compiler, config.devServer);

    Logger.log(`To load your scripts, use this query string: ${colors.yellow(`?debug=true&noredir=true&debugManifestsFile=https://${config.devServer.host}:${config.devServer.port}/temp/manifests.js`)}`);

    server.listen(config.devServer.port, config.devServer.host, (err) => {
      if (err) {
        console.log('An error occured while running web pack dev server. Details:');
        console.log(err);
      }
    });

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

startDevServer();
