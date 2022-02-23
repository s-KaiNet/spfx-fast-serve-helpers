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

  const port = config.devServer?.port || 4321;
  const openDebugArgs =
    !config.devServer.openPage ? `debug=true&noredir=true&debugManifestsFile=https://localhost:${port}/temp/manifests.js`
      : typeof config.devServer.openPage === 'string' ? new URL(config.devServer.openPage).searchParams
        : new URL(config.devServer.openPage[0]).searchParams;
  
  logDebugString(`To load your scripts, use this query string: ${colors.yellow('?' + openDebugArgs)}`);

  server.listen(config.devServer.port, config.devServer.host, (err) => {
    if (err) {
      console.log('An error occured while running web pack dev server. Details:');
      console.log(err);
    }
  });
}
