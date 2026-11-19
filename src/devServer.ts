import path from 'node:path';
import { createServer, version as viteVersion, type ViteDevServer } from 'vite';
import { legacyOptionsFileHint, loadOptionsFile, OPTIONS_FILE, resolveOptions, TENANT_DOMAIN_ENV, type FastServeOptions } from './config/options.js';
import type { ServeContext } from './context.js';
import { createConsoleLogger, type Logger } from './logger.js';
import { packageName, packageVersion } from './packageInfo.js';
import { fastServePlugins } from './plugins.js';
import { assertSupportedSpfxVersion, createProject, findSpfxVersion, type SpfxComponent, type SpfxVersionSource } from './project/index.js';
import { createViteLogger, debugPageUrl, debugQuery, loadDevCertificate, serveConfigurationWarnings } from './server/index.js';
import { errorMessage } from './utils/errors.js';
import {
  findViteExtendFile,
  projectRelative,
  publishFastServeContext,
  viteExtendGuardPlugin,
  viteExtendWatchPlugin,
  webpackCustomizationHint,
  type FastServeContext,
  type FullRestart,
} from './viteExtend/index.js';

export interface StartDevServerOptions {
  root: string;

  cli?: FastServeOptions;
  logger?: Logger;
  requestFullRestart?: FullRestart;
}

export async function startDevServer({ root, cli = {}, logger = createConsoleLogger(), requestFullRestart = () => undefined }: StartDevServerOptions): Promise<ViteDevServer> {
  const startedAt = performance.now();
  const projectRoot = path.resolve(root);
  const spfxVersion = findSpfxVersion(projectRoot);
  assertSupportedSpfxVersion(spfxVersion, { name: packageName, version: packageVersion });
  const legacyOptionsHint = legacyOptionsFileHint(projectRoot);
  if (legacyOptionsHint) logger.warn(legacyOptionsHint);
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
  publishFastServeContext(fastServeContext(context, spfxVersion));
  const viteExtendFile = findViteExtendFile(projectRoot);
  if (viteExtendFile) logger.info(`Vite config: ${projectRelative(projectRoot, viteExtendFile)}`);
  else for (const line of webpackCustomizationHint(projectRoot)) logger.info(line);

  const viteExtendState = { loaded: false };
  const viteExtendPlugins = [
    viteExtendWatchPlugin(context, viteExtendFile, requestFullRestart),
    ...(viteExtendFile ? [viteExtendGuardPlugin(context, viteExtendFile, () => (viteExtendState.loaded = true))] : []),
  ];
  const https = await loadDevCertificate();
  let server: ViteDevServer;
  try {
    server = await createServer({
      root: projectRoot,
      configFile: viteExtendFile ?? false,
      configLoader: 'bundle',
      customLogger: createViteLogger(),
      plugins: [...fastServePlugins(context, https), ...viteExtendPlugins],
    });
  } catch (error) {
    if (viteExtendFile && !viteExtendState.loaded) throw explainViteExtendError(error, projectRelative(projectRoot, viteExtendFile));
    throw error;
  }
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw explainListenError(error, options.port);
  }
  printReady(context, Math.round(performance.now() - startedAt));
  return server;
}

function fastServeContext({ root, options }: ServeContext, spfxVersion: SpfxVersionSource): FastServeContext {
  return {
    root,
    port: options.port,
    origin: options.origin,
    locale: options.locale,
    serveConfiguration: options.serveConfiguration?.name,
    pageUrl: options.pageUrl,
    spfxVersion: installedSpfxVersion(spfxVersion),
    fastServeVersion: packageVersion,
    viteVersion,
  };
}

function installedSpfxVersion(source: SpfxVersionSource): string {
  if (source.kind === 'installed') return source.version;
  if (source.kind === 'declared') return source.range;
  return 'unknown';
}

function explainViteExtendError(error: unknown, relativeFile: string): Error {
  return new Error(`${relativeFile} could not be loaded: ${errorMessage(error)}\nFix or remove the file and run fast-serve again.`, { cause: error });
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
