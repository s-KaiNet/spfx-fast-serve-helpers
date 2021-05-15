/* eslint-disable no-console */

import { resultConfig } from './configureWebPack';
import Webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';

export function startDevServer() {
  const compiler = Webpack(resultConfig);
  const server = new WebpackDevServer(compiler, resultConfig.devServer);

  server.listen(resultConfig.devServer.port, resultConfig.devServer.host, (err) => {
    if (err) {
      console.log('An error occured while running web pack dev server. Details:');
      console.log(err);
    }
  });
}