import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { loadOptionsFile, OPTIONS_FILE, resolveOptions, TENANT_DOMAIN_ENV, type FastServeOptions } from './config/options.js';
import type { ServeContext } from './context.js';
import { createConsoleLogger, type Logger } from './logger.js';
import { packageName, packageVersion } from './packageInfo.js';
import { fastServePlugins } from './plugins.js';
import { assertSupportedSpfxVersion, createProject, findSpfxVersion } from './project/index.js';
import { createViteLogger, debugPageUrl, debugQuery, loadDevCertificate } from './server/index.js';

export interface StartDevServerOptions {
  root: string;

  cli?: FastServeOptions;
  logger?: Logger;
}

export async function startDevServer({ root, cli = {}, logger = createConsoleLogger() }: StartDevServerOptions): Promise<ViteDevServer> {
  const startedAt = performance.now();
  const projectRoot = path.resolve(root);
  assertSupportedSpfxVersion(findSpfxVersion(projectRoot), { name: packageName, version: packageVersion });
  const project = createProject(projectRoot, logger);
  const options = resolveOptions({ cli, file: loadOptionsFile(projectRoot), defaults: project.serveConfig() });
  if (project.components().length === 0) {
    throw new Error(
      'No web parts found in config/config.json bundles. fast-serve serves web parts only for now ' +
        '(extensions, Adaptive Card Extensions and library components are not supported yet).',
    );
  }
  const context: ServeContext = { root: projectRoot, options, project, logger };

  const server = await createServer({
    root: projectRoot,
    configFile: false,
    customLogger: createViteLogger(),
    plugins: fastServePlugins(context, await loadDevCertificate()),
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw explainListenError(error, options.port);
  }
  printReady(context, Math.round(performance.now() - startedAt));
  return server;
}

function explainListenError(error: unknown, port: number): unknown {
  if (!(error instanceof Error) || !/already in use/i.test(error.message)) return error;
  return new Error(
    `Port ${port} is already in use (another fast-serve or "heft start" may be running). ` +
      `Stop it, or choose another port: fast-serve --port ${port + 1}, or "port" in ${OPTIONS_FILE}.`,
    { cause: error },
  );
}

function printReady({ options, project, logger }: ServeContext, elapsedMs: number): void {
  const names = project.components().map((component) => component.manifest.alias).join(', ');
  const lines = [`ready in ${elapsedMs} ms at ${options.origin}`, `web parts: ${names}`];
  if (options.pageUrl) {
    lines.push(`open: ${debugPageUrl(options.pageUrl, options.origin)}`);
  } else {
    if (options.pageUrlTemplate) lines.push(`set ${TENANT_DOMAIN_ENV} to resolve the page URL "${options.pageUrlTemplate}"`);
    lines.push(`append to your SharePoint page URL: ?${debugQuery(options.origin)}`);
  }
  lines.push('the debug query sticks to the browser tab: after stopping fast-serve, open the page in a new tab');
  for (const line of lines) logger.info(line);
}
