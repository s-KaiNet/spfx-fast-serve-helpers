import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { loadOptionsFile, OPTIONS_FILE, resolveOptions, TENANT_DOMAIN_ENV, type FastServeOptions } from './config/options.js';
import type { ServeContext } from './context.js';
import { createConsoleLogger, type Logger } from './logger.js';
import { packageName, packageVersion } from './packageInfo.js';
import { fastServePlugins } from './plugins.js';
import { assertSupportedSpfxVersion, createProject, findSpfxVersion, type SpfxComponent } from './project/index.js';
import { createViteLogger, debugPageUrl, debugQuery, loadDevCertificate, serveConfigurationWarnings } from './server/index.js';

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
    throw new Error('No web parts, extensions or Adaptive Card Extensions found in config/config.json bundles (library components are not supported yet).');
  }
  for (const warning of options.warnings) logger.warn(warning);
  if (options.serveConfiguration) {
    const { name, ...configuration } = options.serveConfiguration;
    for (const warning of serveConfigurationWarnings(name, configuration, project.components())) logger.warn(warning);
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
  const lines = [`ready in ${elapsedMs} ms at ${options.origin}`, ...componentLines(project.components())];
  const { serveConfiguration } = options;
  if (serveConfiguration) lines.push(`serve configuration: ${serveConfiguration.name}`);
  if (options.pageUrl) {
    lines.push(`open: ${debugPageUrl(options.pageUrl, options.origin, serveConfiguration)}`);
  } else {
    if (options.pageUrlTemplate) lines.push(`set ${TENANT_DOMAIN_ENV} to resolve the page URL "${options.pageUrlTemplate}"`);
    lines.push(`append to your SharePoint page URL: ?${debugQuery(options.origin, serveConfiguration)}`);
  }
  lines.push('the debug query sticks to the browser tab: after stopping fast-serve, open the page in a new tab');
  for (const line of lines) logger.info(line);
}

function componentLines(components: readonly SpfxComponent[]): string[] {
  const ofType = (componentType: string) => components.filter((component) => component.manifest.componentType === componentType);
  return [
    ...componentLine('web parts', ofType('WebPart'), ({ manifest }) => manifest.alias),
    ...componentLine('extensions', ofType('Extension'), ({ manifest }) => `${manifest.alias} (${manifest.extensionType ?? 'Extension'})`),
    ...componentLine('Adaptive Card Extensions', ofType('AdaptiveCardExtension'), ({ manifest }) => manifest.alias),
  ];
}

function componentLine(label: string, members: readonly SpfxComponent[], describe: (component: SpfxComponent) => string): string[] {
  return members.length > 0 ? [`${label}: ${members.map(describe).join(', ')}`] : [];
}
