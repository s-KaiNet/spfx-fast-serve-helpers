import path from 'node:path';
const lib = '/home/sergei/Projects/spfx-rea/node_modules/spfx-fast-serve-helpers/lib';
const { createServer } = await import('/home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/index.js');
const { loadOptionsFile, resolveOptions } = await import(`${lib}/config/options.js`);
const { createConsoleLogger } = await import(`${lib}/logger.js`);
const { fastServePlugins } = await import(`${lib}/plugins.js`);
const { createProject } = await import(`${lib}/project/index.js`);
const { createViteLogger, loadDevCertificate } = await import(`${lib}/server/index.js`);

const root = '/home/sergei/Projects/spfx-rea';
const mode = process.env.EXP_MODE ?? 'none';
const logger = createConsoleLogger();
const project = createProject(root, logger);
const options = resolveOptions({ cli: {}, file: loadOptionsFile(root), defaults: project.serveConfig() });
const context = { root, options, project, logger };

const runtimeDir = '/tmp/deco-exp/node_modules/@oxc-project/runtime';
const oxcRuntime = {
  name: 'exp:oxc-runtime',
  config: () => ({
    resolve: { alias: [{ find: /^@oxc-project\/runtime\/helpers\/(.*)$/, replacement: `${runtimeDir}/src/helpers/esm/$1.js` }] },
    server: { fs: { allow: ['/tmp/deco-exp'] } },
  }),
};
const modeConfig = {
  none: {},
  tsconfig: { tsconfig: path.join(root, 'tsconfig.json') },
  raw: { oxc: { tsconfig: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: process.env.EXP_META === '1', strict: true, target: 'es5' } } } },
  oxc: { oxc: { decorator: { legacy: true, emitDecoratorMetadata: process.env.EXP_META === '1' }, typescript: { removeClassFieldsWithoutInitializer: true }, assumptions: { setPublicClassFields: true } } },
}[mode];

const server = await createServer({
  root,
  configFile: false,
  customLogger: createViteLogger(),
  ...modeConfig,
  plugins: [...fastServePlugins(context, await loadDevCertificate()), process.env.EXP_RUNTIME === '1' ? oxcRuntime : null],
});
await server.listen();
logger.info(`exp server mode=${mode} runtime=${process.env.EXP_RUNTIME ?? '0'} on ${options.origin}`);
