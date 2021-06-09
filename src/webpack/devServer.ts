/* eslint-disable no-console */

import { resultConfig } from './configureWebPack';
import Webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';

export async function startDevServer() {
  const config = await resultConfig();
  
  const compiler = Webpack(config);
  const server = new WebpackDevServer(compiler, config.devServer);

  server.listen(config.devServer.port, config.devServer.host, (err) => {
    if (err) {
      console.log('An error occured while running web pack dev server. Details:');
      console.log(err);
    }
  });
}
