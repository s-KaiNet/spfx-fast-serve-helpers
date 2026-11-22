import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOCALE, type ServeConfiguration } from '../project/index.js';
import { isObject } from '../utils/guards.js';
import { readOptionalJsoncFile } from '../utils/jsonc.js';
import { isRetiredWorkbenchUrl, retiredWorkbenchWarning } from './retiredWorkbench.js';

export interface FastServeOptions {
  port?: number;

  pageUrl?: string;

  locale?: string;

  serveConfiguration?: string;

  overlay?: boolean;

  deployedLibraries?: string[];

  typeCheck?: boolean;

  typeCheckOverlay?: boolean;

  lint?: LintSetting;
}

export type LintSetting = boolean | 'full';

export interface SelectedServeConfiguration extends ServeConfiguration {
  name: string;
}

export interface ResolvedOptions {
  port: number;

  origin: string;

  localOrigin: string;

  tunnelHost: string | undefined;
  locale: string;

  pageUrl: string | undefined;

  pageUrlTemplate: string | undefined;

  serveConfiguration: SelectedServeConfiguration | undefined;

  overlay: boolean;

  typeCheck: boolean;

  typeCheckOverlay: boolean;

  lint: LintSetting;

  warnings: string[];
}

export interface OptionDefaults {
  port?: number;
  initialPage?: string;
  serveConfigurations?: Record<string, ServeConfiguration>;
}

export const FAST_SERVE_FOLDER = 'fast-serve';
export const OPTIONS_FILE = `${FAST_SERVE_FOLDER}/config.json`;
export const LEGACY_OPTIONS_FILE = 'config/fast-serve.json';
export const DEFAULT_PORT = 4321;
export const TENANT_DOMAIN_ENV = 'SPFX_SERVE_TENANT_DOMAIN';
export const DEFAULT_SERVE_CONFIGURATION = 'default';
const TENANT_DOMAIN_PLACEHOLDER = '{tenantDomain}';
const TYPE_CHECK_OVERLAY_WITHOUT_TYPE_CHECK = 'the type check overlay is off because type checking is off (remove --no-type-check or "typeCheck": false)';

export function resolveOptions(
  sources: { cli?: FastServeOptions; file?: FastServeOptions; defaults?: OptionDefaults },
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOptions {
  const { cli = {}, file = {}, defaults = {} } = sources;
  const port = cli.port ?? file.port ?? defaults.port ?? DEFAULT_PORT;
  validatePort(port);
  const locale = (cli.locale ?? file.locale ?? DEFAULT_LOCALE).trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]+)*$/.test(locale)) throw new Error(`Invalid locale "${locale}" (expected e.g. "en-us")`);
  const warnings: string[] = [];
  const serveConfiguration = selectServeConfiguration(defaults.serveConfigurations, cli.serveConfiguration ?? file.serveConfiguration, warnings);
  const page = selectPage(cli, file, defaults, serveConfiguration);
  const pointsToRetiredWorkbench = page !== undefined && isRetiredWorkbenchUrl(page.url);
  if (pointsToRetiredWorkbench) warnings.push(retiredWorkbenchWarning(page.source, page.url));
  const pageUrlTemplate = pointsToRetiredWorkbench ? undefined : page?.url;
  const typeCheck = cli.typeCheck ?? file.typeCheck ?? true;
  const typeCheckOverlayChoice = cli.typeCheckOverlay ?? file.typeCheckOverlay;
  if (typeCheckOverlayChoice === true && !typeCheck) warnings.push(TYPE_CHECK_OVERLAY_WITHOUT_TYPE_CHECK);
  return {
    port,
    origin: localOrigin(port),
    localOrigin: localOrigin(port),
    tunnelHost: undefined,
    locale,
    pageUrl: pageUrlTemplate === undefined ? undefined : substituteTenantDomain(pageUrlTemplate, env[TENANT_DOMAIN_ENV]),
    pageUrlTemplate,
    serveConfiguration,
    overlay: cli.overlay ?? file.overlay ?? true,
    typeCheck,
    typeCheckOverlay: typeCheck && (typeCheckOverlayChoice ?? true),
    lint: cli.lint ?? file.lint ?? true,
    warnings,
  };
}

function localOrigin(port: number): string {
  return `https://localhost:${port}`;
}

export function withTunnelHost(options: ResolvedOptions, tunnelHost: string | undefined): ResolvedOptions {
  if (tunnelHost === undefined) return { ...options, origin: options.localOrigin, tunnelHost: undefined };
  return { ...options, origin: `https://${tunnelHost}`, tunnelHost };
}

interface PageSetting {
  source: string;
  url: string;
}

function selectPage(
  cli: FastServeOptions,
  file: FastServeOptions,
  defaults: OptionDefaults,
  serveConfiguration: SelectedServeConfiguration | undefined,
): PageSetting | undefined {
  const namedConfigurationPage = serveConfiguration?.name === DEFAULT_SERVE_CONFIGURATION ? undefined : serveConfiguration?.pageUrl;
  const candidates: { source: string; url: string | undefined }[] = [
    { source: `config/serve.json serveConfigurations.${serveConfiguration?.name ?? ''}.pageUrl`, url: namedConfigurationPage },
    { source: '--page-url', url: cli.pageUrl },
    { source: `${OPTIONS_FILE} "pageUrl"`, url: file.pageUrl },
    { source: `config/serve.json serveConfigurations.${DEFAULT_SERVE_CONFIGURATION}.pageUrl`, url: defaults.serveConfigurations?.[DEFAULT_SERVE_CONFIGURATION]?.pageUrl },
    { source: 'config/serve.json "initialPage"', url: defaults.initialPage },
  ];
  return candidates.find((candidate): candidate is PageSetting => candidate.url !== undefined);
}

function selectServeConfiguration(
  configurations: Record<string, ServeConfiguration> | undefined,
  requestedName: string | undefined,
  warnings: string[],
): SelectedServeConfiguration | undefined {
  const configuration = configurations?.[requestedName ?? DEFAULT_SERVE_CONFIGURATION];
  if (configuration) return { name: requestedName ?? DEFAULT_SERVE_CONFIGURATION, ...configuration };
  if (requestedName === undefined) return undefined;
  const available = Object.keys(configurations ?? {});
  const fallback = configurations?.[DEFAULT_SERVE_CONFIGURATION];
  warnings.push(
    `serve configuration "${requestedName}" not found in config/serve.json "serveConfigurations"` +
      (available.length > 0 ? ` (available: ${available.join(', ')})` : ' (the file has none)') +
      (fallback ? `, using "${DEFAULT_SERVE_CONFIGURATION}"` : ''),
  );
  return fallback ? { name: DEFAULT_SERVE_CONFIGURATION, ...fallback } : undefined;
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
  const port = /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  if (Number.isNaN(port)) throw new Error(`Invalid port "${value}" (expected 1-65535)`);
  validatePort(port);
  return port;
}

export function legacyOptionsFileHint(root: string): string | undefined {
  if (existsSync(path.join(root, OPTIONS_FILE)) || !existsSync(path.join(root, LEGACY_OPTIONS_FILE))) return undefined;
  return `${LEGACY_OPTIONS_FILE} is not read anymore: move it to ${OPTIONS_FILE} (same options)`;
}

export const OPTIONS_SCHEMA_PATH = '../node_modules/spfx-fast-serve-helpers/schema/config.schema.json';

type OptionName = keyof FastServeOptions;
type OptionValues = Required<FastServeOptions>;
type OptionGuards = { [Name in OptionName]: (value: unknown) => value is OptionValues[Name] };

const OPTION_GUARDS: OptionGuards = {
  port: isNumber,
  pageUrl: isString,
  locale: isString,
  serveConfiguration: isString,
  overlay: isBoolean,
  deployedLibraries: isStringArray,
  typeCheck: isBoolean,
  typeCheckOverlay: isBoolean,
  lint: isLintSetting,
};

export const OPTION_NAMES: readonly OptionName[] = Object.keys(OPTION_GUARDS).filter(isOptionName);

const DROPPED_OPTIONS = new Map([['amdPackages', 'not needed: AMD and UMD code in dependencies is bundled like in heft']]);

const CLASSIC_SERVE_KEY = 'serve';
const CLASSIC_OPTION_NAMES = new Map<string, OptionName>([
  ['port', 'port'],
  ['openUrl', 'pageUrl'],
  ['locale', 'locale'],
  ['config', 'serveConfiguration'],
  ['fullScreenErrors', 'overlay'],
  ['eslint', 'lint'],
]);

export function loadOptionsFile(root: string, warn: (message: string) => void = () => undefined): FastServeOptions {
  const file = path.join(root, OPTIONS_FILE);
  const json = readOptionalJsoncFile(file);
  if (json === undefined) return {};
  if (!isObject(json)) throw new Error(`${OPTIONS_FILE} must contain a JSON object`);
  const options: FastServeOptions = {};
  for (const [key, value] of Object.entries(json)) {
    if (key === '$schema') continue;
    if (key === CLASSIC_SERVE_KEY && isObject(value)) {
      warn(classicFormatWarning(value));
      continue;
    }
    const droppedReason = DROPPED_OPTIONS.get(key);
    if (droppedReason !== undefined) {
      warn(`${OPTIONS_FILE}: "${key}" is ignored (${droppedReason})`);
      continue;
    }
    if (!isOptionName(key) || !readOption(options, key, value)) {
      throw new Error(`${OPTIONS_FILE}: unknown option or wrong type "${key}" (supported: ${OPTION_NAMES.join(', ')}; schema: "$schema": "${OPTIONS_SCHEMA_PATH}")`);
    }
  }
  return options;
}

function readOption<Name extends OptionName>(options: Pick<FastServeOptions, Name>, name: Name, value: unknown): boolean {
  const guard: (value: unknown) => value is OptionValues[Name] = OPTION_GUARDS[name];
  if (!guard(value)) return false;
  options[name] = value;
  return true;
}

function classicFormatWarning(classic: Record<string, unknown>): string {
  const converted: FastServeOptions = {};
  for (const [classicName, value] of Object.entries(classic)) {
    const name = CLASSIC_OPTION_NAMES.get(classicName);
    if (name !== undefined) readOption(converted, name, value);
  }
  const flat = JSON.stringify({ $schema: OPTIONS_SCHEMA_PATH, ...converted });
  return (
    `${OPTIONS_FILE}: the nested "${CLASSIC_SERVE_KEY}" object of the classic spfx-fast-serve format is ignored. ` +
    `Use the flat format with the schema shipped in the package: ${flat}`
  );
}

function isOptionName(key: string): key is OptionName {
  return Object.hasOwn(OPTION_GUARDS, key);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isLintSetting(value: unknown): value is LintSetting {
  return typeof value === 'boolean' || value === 'full';
}
