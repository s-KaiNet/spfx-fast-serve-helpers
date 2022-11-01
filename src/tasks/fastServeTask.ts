import { fork } from 'child_process';
import { resolve } from 'path';

export function addFastServeTask(build: any): void {
  const fastServeTask = build.subTask('fast-serve', function () {
    fork(resolve(__dirname, '../serve'));
  });

  build.rig.addPostBundleTask(fastServeTask);
}
