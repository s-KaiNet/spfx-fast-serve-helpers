#!/usr/bin/env node

import { startDevServer } from './webpack/devServer';

(async () => {
  await startDevServer();
})();

