type Build = typeof import('@microsoft/sp-build-web');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const workbenchApi = require('@microsoft/sp-webpart-workbench/lib/api');

export function addWorkbenchTask(build: Build): void {
  const ensureWorkbenchSubtask = build.subTask('ensure-workbench', function (gulp, config, done) {
    try {
      workbenchApi.default['/workbench']();
    } catch (e) {
      //
    }

    done();
  });

  build.rig.addPostBuildTask(ensureWorkbenchSubtask);
}