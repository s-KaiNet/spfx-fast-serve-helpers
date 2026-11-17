import { readFileSync } from 'node:fs';
import path from 'node:path';
import { init } from 'es-module-lexer';
import type { DevEnvironment, Plugin } from 'vite';
import type { ServeContext } from '../../context.js';
import { isInside, toPosix, toRootUrl } from '../../utils/paths.js';
import { withoutQuery } from '../../utils/vite.js';
import { isProjectScript, NODE_MODULES_ID, PROJECT_SCRIPT_ID } from '../projectSource.js';
import { formatMetadataImportMessage, formatTypeReexportMessage } from './message.js';
import { findMetadataTypeImports } from './metadataImports.js';
import { collectRuntimeExports, findValueReexports, groupBy, removeReexports } from './reexports.js';

const EXPORT_LIST = /\bexport\s*\{/;
const TYPE_NAME_CANDIDATES = /\bexport\s*\{|typeof [\w$]+ === "undefined" \? Object : /;
const VIRTUAL_ID_PREFIX = '\0';
const VIRTUAL_URL_PREFIX = '/@id/__x00__';

export interface RuntimeExports {
  readonly names: ReadonlySet<string>;
  readonly complete: boolean;
}

const UNKNOWN_EXPORTS: RuntimeExports = { names: new Set(), complete: false };

interface ImportedName {
  readonly importedName: string;
  readonly from: string;
}

interface MissingName<T extends ImportedName> {
  readonly entry: T;
  readonly target: string;
}

type Severity = 'error' | 'warn';

export function typeOnlyNamesGuardPlugin({ root, logger }: Pick<ServeContext, 'root' | 'logger'>): Plugin {
  const modulesBeingChecked = new Set<string>();
  const reportedMessages = new Map<string, string>();

  const report = (id: string, messages: readonly { severity: Severity; message: string }[]) => {
    const key = messages.map(({ message }) => message).join('\n');
    if (reportedMessages.get(id) === key) return;
    reportedMessages.set(id, key);
    for (const { severity, message } of messages) logger[severity](message);
  };

  return {
    name: 'fast-serve:type-only-names',
    apply: 'serve',
    transform: {
      filter: { id: { include: PROJECT_SCRIPT_ID, exclude: NODE_MODULES_ID }, code: TYPE_NAME_CANDIDATES },
      async handler(code, id) {
        const environment = this.environment;
        if (environment.mode !== 'dev' || !isProjectScript(root, id)) return null;
        await init();
        const reexports = EXPORT_LIST.test(code) ? findValueReexports(code) : [];
        const metadataImports = findMetadataTypeImports(code);
        if (reexports.length === 0 && metadataImports.length === 0) {
          reportedMessages.delete(id);
          return null;
        }

        const importerUrl = toRootUrl(root, id);
        modulesBeingChecked.add(importerUrl);
        try {
          const lookup: NameLookup = {
            resolve: (from) => this.resolve(from, id),
            runtimeExportsOf: (request) => readRuntimeExports(environment, request, modulesBeingChecked),
          };
          const [missingReexports, missingImports] = await Promise.all([findMissingNames(root, reexports, lookup), findMissingNames(root, metadataImports, lookup)]);
          if (missingReexports.length === 0 && missingImports.length === 0) {
            reportedMessages.delete(id);
            return null;
          }
          const source = readSource(id, code);
          const describe = <T extends ImportedName>(missing: readonly MissingName<T>[]) =>
            missing.map(({ entry, target }) => ({ name: entry.importedName, from: entry.from, target }));
          const messages: { severity: Severity; message: string; browserConsole: string }[] = [];
          if (missingReexports.length > 0) {
            messages.push({ severity: 'error', message: formatTypeReexportMessage(root, id, source, describe(missingReexports)), browserConsole: 'console.error' });
          }
          if (missingImports.length > 0) {
            messages.push({ severity: 'warn', message: formatMetadataImportMessage(root, id, source, describe(missingImports)), browserConsole: 'console.warn' });
          }
          report(id, messages);
          const output = removeReexports(
            code,
            missingReexports.map(({ entry }) => entry),
            missingImports.map(({ entry }) => entry),
          );
          output.prepend(messages.map(({ browserConsole, message }) => `${browserConsole}(${JSON.stringify(`[fast-serve] ${message}`)});\n`).join(''));
          return { code: output.toString(), map: output.generateMap({ hires: 'boundary', source: id, includeContent: true }) };
        } finally {
          modulesBeingChecked.delete(importerUrl);
        }
      },
    },
  };
}

interface NameLookup {
  resolve(from: string): Promise<{ id: string; external: boolean | 'absolute' | 'relative' } | null>;
  runtimeExportsOf(request: string): Promise<RuntimeExports>;
}

async function findMissingNames<T extends ImportedName>(root: string, entries: readonly T[], lookup: NameLookup): Promise<MissingName<T>[]> {
  const groups = await Promise.all(
    [...groupBy(entries, (entry) => entry.from)].map(async ([from, group]) => {
      const resolved = await lookup.resolve(from);
      const request = resolved && !resolved.external ? checkableRequest(root, resolved.id) : undefined;
      if (!resolved || !request) return [];
      const provided = await lookup.runtimeExportsOf(request);
      if (!provided.complete) return [];
      const target = displayTarget(root, resolved.id);
      return group.filter((entry) => !provided.names.has(entry.importedName)).map((entry) => ({ entry, target }));
    }),
  );
  return groups.flat();
}

async function readRuntimeExports(environment: DevEnvironment, request: string, modulesBeingChecked: ReadonlySet<string>, visited = new Set<string>()): Promise<RuntimeExports> {
  if (visited.has(request)) return { names: new Set(), complete: true };
  visited.add(request);
  if (modulesBeingChecked.has(request)) return UNKNOWN_EXPORTS;

  const transformed = await environment.transformRequest(request).catch(() => null);
  if (!transformed) return UNKNOWN_EXPORTS;

  const { names, starSources } = collectRuntimeExports(transformed.code);
  const starExports = await Promise.all(
    starSources.map(async (source) => {
      const starRequest = checkableStarRequest(source);
      return starRequest ? readRuntimeExports(environment, starRequest, modulesBeingChecked, visited) : UNKNOWN_EXPORTS;
    }),
  );
  let complete = true;
  for (const star of starExports) {
    if (!star.complete) complete = false;
    star.names.forEach((name) => name !== 'default' && names.add(name));
  }
  return { names, complete };
}

export function checkableRequest(root: string, id: string): string | undefined {
  if (id.startsWith(VIRTUAL_ID_PREFIX)) return id;
  const file = withoutQuery(id);
  return path.isAbsolute(file) && isInside(root, file) && !NODE_MODULES_ID.test(file) ? toRootUrl(root, file) : undefined;
}

function checkableStarRequest(source: string): string | undefined {
  const url = withoutQuery(source);
  if (url.startsWith(VIRTUAL_URL_PREFIX)) return VIRTUAL_ID_PREFIX + url.slice(VIRTUAL_URL_PREFIX.length);
  if (!url.startsWith('/') || url.startsWith('/@') || url.includes('/node_modules/')) return undefined;
  return url;
}

function readSource(id: string, fallback: string): string {
  try {
    return readFileSync(withoutQuery(id), 'utf8');
  } catch {
    return fallback;
  }
}

function displayTarget(root: string, id: string): string {
  if (id.startsWith(VIRTUAL_ID_PREFIX)) return id.slice(VIRTUAL_ID_PREFIX.length);
  return toPosix(path.relative(root, withoutQuery(id)));
}
