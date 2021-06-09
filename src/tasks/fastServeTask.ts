import { fork } from 'child_process';
import { resolve } from 'path';
type Build = typeof import('@microsoft/sp-build-web');

export function addFastServeTask(build: Build): void {
  const fastServeTask = build.subTask('fast-serve', function () {
    fork(resolve(__dirname, '../serve'));
  });

  build.rig.addPostBundleTask(fastServeTask);
}
