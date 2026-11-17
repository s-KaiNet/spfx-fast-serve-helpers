import path from 'node:path';
import { DEFAULT_LOCALE, type ServeConfiguration } from '../project/index.js';
import { isObject } from '../utils/guards.js';
import { readOptionalJsoncFile } from '../utils/jsonc.js';

export interface FastServeOptions {
  port?: number;

  pageUrl?: string;

  locale?: string;

  serveConfiguration?: string;
}

export interface SelectedServeConfiguration extends ServeConfiguration {
  name: string;
}

export interface ResolvedOptions {
  port: number;

  origin: string;
  locale: string;

  pageUrl: string | undefined;

  pageUrlTemplate: string | undefined;

  serveConfiguration: SelectedServeConfiguration | undefined;

  replacedServeConfigurationPage: string | undefined;
}

export interface OptionDefaults {
  port?: number;
  initialPage?: string;
  serveConfigurations?: Record<string, ServeConfiguration>;
}

export const OPTIONS_FILE = 'config/fast-serve.json';
export const DEFAULT_PORT = 4321;
export const TENANT_DOMAIN_ENV = 'SPFX_SERVE_TENANT_DOMAIN';
export const DEFAULT_SERVE_CONFIGURATION = 'default';
const TENANT_DOMAIN_PLACEHOLDER = '{tenantDomain}';

export function resolveOptions(
  sources: { cli?: FastServeOptions; file?: FastServeOptions; defaults?: OptionDefaults },
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOptions {
  const { cli = {}, file = {}, defaults = {} } = sources;
  const port = cli.port ?? file.port ?? defaults.port ?? DEFAULT_PORT;
  validatePort(port);
  const locale = (cli.locale ?? file.locale ?? DEFAULT_LOCALE).trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]+)*$/.test(locale)) throw new Error(`Invalid locale "${locale}" (expected e.g. "en-us")`);
  const serveConfiguration = selectServeConfiguration(defaults.serveConfigurations, cli.serveConfiguration ?? file.serveConfiguration);
  const pageUrlOption = cli.pageUrl ?? file.pageUrl;
  const pageUrlTemplate =
    pageUrlOption ?? serveConfiguration?.pageUrl ?? defaults.serveConfigurations?.[DEFAULT_SERVE_CONFIGURATION]?.pageUrl ?? defaults.initialPage;
  const resolvePage = (template: string) => substituteTenantDomain(template, env[TENANT_DOMAIN_ENV]);
  const pageUrl = pageUrlTemplate === undefined ? undefined : resolvePage(pageUrlTemplate);
  const configurationPage = serveConfiguration?.pageUrl;
  const replacedServeConfigurationPage =
    pageUrlOption !== undefined && configurationPage !== undefined && resolvePage(configurationPage) !== pageUrl ? configurationPage : undefined;
  return {
    port,
    origin: `https://localhost:${port}`,
    locale,
    pageUrl,
    pageUrlTemplate,
    serveConfiguration,
    replacedServeConfigurationPage,
  };
}

function selectServeConfiguration(
  configurations: Record<string, ServeConfiguration> | undefined,
  requestedName: string | undefined,
): SelectedServeConfiguration | undefined {
  const name = requestedName ?? DEFAULT_SERVE_CONFIGURATION;
  const configuration = configurations?.[name];
  if (configuration) return { name, ...configuration };
  if (requestedName === undefined) return undefined;
  const available = Object.keys(configurations ?? {});
  throw new Error(
    `Serve configuration "${requestedName}" not found in config/serve.json "serveConfigurations"` +
      (available.length > 0 ? ` (available: ${available.join(', ')})` : ' (the file has none)'),
  );
}

function substituteTenantDomain(template: string, tenantDomain: string | undefined): string | undefined {
  if (!template.includes(TENANT_DOMAIN_PLACEHOLDER)) return template;
  const domain = tenantDomain?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return domain ? template.replaceAll(TENANT_DOMAIN_PLACEHOLDER, domain) : undefined;
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port "${port}" (expected 1-65535)`);
}

export function parsePort(value: string): number {
  const port = Number(value);
  validatePort(port);
  return port;
}

export function loadOptionsFile(root: string): FastServeOptions {
  const file = path.join(root, OPTIONS_FILE);
  const json = readOptionalJsoncFile(file);
  if (json === undefined) return {};
  if (!isObject(json)) throw new Error(`${OPTIONS_FILE} must contain a JSON object`);
  const options: FastServeOptions = {};
  for (const [key, value] of Object.entries(json)) {
    if (key === '$schema') continue;
    if (key === 'port' && typeof value === 'number') options.port = value;
    else if (key === 'pageUrl' && typeof value === 'string') options.pageUrl = value;
    else if (key === 'locale' && typeof value === 'string') options.locale = value;
    else if (key === 'serveConfiguration' && typeof value === 'string') options.serveConfiguration = value;
    else throw new Error(`${OPTIONS_FILE}: unknown option or wrong type "${key}" (supported: port, pageUrl, locale, serveConfiguration)`);
  }
  return options;
}
