import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { loadOptionsFile, resolveOptions, TENANT_DOMAIN_ENV, type FastServeOptions } from './config/options.js';
import type { ServeContext } from './context.js';
import { createConsoleLogger, type Logger } from './logger.js';
import { fastServePlugins } from './plugins.js';
import { createProject } from './project/index.js';
import { debugPageUrl, debugQuery, loadDevCertificate } from './server/index.js';

export interface StartDevServerOptions {
  root: string;

  cli?: FastServeOptions;
  logger?: Logger;
}

export async function startDevServer({ root, cli = {}, logger = createConsoleLogger() }: StartDevServerOptions): Promise<ViteDevServer> {
  const startedAt = performance.now();
  const projectRoot = path.resolve(root);
  const project = createProject(projectRoot, logger);
  const options = resolveOptions({ cli, file: loadOptionsFile(projectRoot), defaults: project.serveConfig() });
  if (project.components().length === 0) {
    throw new Error('No web parts found in config/config.json (only web parts are supported for now).');
  }
  const context: ServeContext = { root: projectRoot, options, project, logger };

  const server = await createServer({
    root: projectRoot,
    configFile: false,
    plugins: fastServePlugins(context, await loadDevCertificate()),
  });
  await server.listen();
  printReady(context, Math.round(performance.now() - startedAt));
  return server;
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
  for (const line of lines) logger.info(line);
}
