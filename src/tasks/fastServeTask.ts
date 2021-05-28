import { startDevServer } from '../webpack/devServer';

type Build = typeof import('@microsoft/sp-build-web');

export function addFastServeTask(build: Build): void {
  const fastServeTask = build.subTask('fast-serve', function () {
    startDevServer();
  });

  build.rig.addPostBundleTask(fastServeTask);
}