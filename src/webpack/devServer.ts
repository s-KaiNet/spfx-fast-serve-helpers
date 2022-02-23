/* eslint-disable no-console */
import colors from 'colors';

import { resultConfig } from './configureWebPack';
import Webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { logDebugString } from './helpers';

export async function startDevServer() {
  const config = await resultConfig();
  
  const compiler = Webpack(config);
  const server = new WebpackDevServer(compiler, config.devServer);

  logDebugString(`To load your scripts, use this query string: ${colors.yellow('?debug=true&noredir=true&debugManifestsFile=https://localhost:4321/temp/manifests.js')}`);

  server.listen(config.devServer.port, config.devServer.host, (err) => {
    if (err) {
      console.log('An error occured while running web pack dev server. Details:');
      console.log(err);
    }
  });
}
