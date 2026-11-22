import path from 'node:path';
import type { ConfigExternal, SpfxLibrary } from '../project/index.js';
import { toPosix } from '../shared/paths.js';
import type { BrowserErrorReport } from './contracts.js';

export interface LoadErrorFacts {
  root: string;
  configExternals: ReadonlyMap<string, ConfigExternal>;
  libraries: ReadonlyMap<string, SpfxLibrary>;
  compileFailed: boolean;
}

export interface LoadErrorDescription {
  reason: string;
  pageReason?: string;
  showFrames: boolean;
}

const SCRIPT_ERROR_MODULE = /Script error for "([^"]+)"/;
const COMPILE_FAILURE = /Module (?:build|parse) failed|Module not found|Cannot find module/;
const DECORATION = /^[\s×⚠]+/;

export function describeLoadError(report: BrowserErrorReport, facts: LoadErrorFacts): LoadErrorDescription {
  if (report.requireType === 'scripterror') return { reason: scriptErrorReason(report, facts), showFrames: false };
  if (facts.compileFailed || COMPILE_FAILURE.test(report.message)) {
    return {
      reason: 'a module in it failed to compile (the compile error is printed above); the page reloads after the fix',
      pageReason: 'a module in it failed to compile; the page reloads after the fix',
      showFrames: false,
    };
  }
  return { reason: `${report.name}: ${firstLine(report.message)}`, showFrames: true };
}

export function loadErrorHeadline(report: BrowserErrorReport, { reason }: LoadErrorDescription): string {
  return `[Bundle load error] ${bundleLabel(report)} could not be loaded: ${reason}`;
}

export function loadErrorPageMessage(report: BrowserErrorReport, { reason, pageReason }: LoadErrorDescription): string {
  return `[fast-serve] ${bundleLabel(report)} could not be loaded: ${pageReason ?? reason}. Details are in the fast-serve terminal.`;
}

function bundleLabel({ bundle }: BrowserErrorReport): string {
  return bundle === undefined ? 'a bundle' : `bundle "${bundle}"`;
}

function scriptErrorReason(report: BrowserErrorReport, { root, configExternals, libraries }: LoadErrorFacts): string {
  const module = report.requireModules?.[0] ?? SCRIPT_ERROR_MODULE.exec(report.message)?.[1] ?? '';
  const external = configExternals.get(module.slice(module.lastIndexOf('/') + 1));
  if (external !== undefined) {
    return `the script of the config.json external "${external.name}" (${externalLocation(root, external)}) failed to load; check its path or URL in config/config.json and that SharePoint can reach it`;
  }
  const library = [...libraries.values()].find(({ id }) => module.startsWith(id));
  if (library !== undefined) {
    return `the SPFx library "${library.packageName}" (id ${library.id}, version ${library.version}) failed to load; check that the library is deployed to the tenant or site app catalog`;
  }
  return `the script "${module}" failed to load`;
}

function externalLocation(root: string, { source }: ConfigExternal): string {
  return source.type === 'url' ? source.url : toPosix(path.relative(root, source.file));
}

function firstLine(message: string): string {
  const line = message.split('\n').find((text) => text.replace(DECORATION, '') !== '') ?? '';
  return line.replace(DECORATION, '');
}
