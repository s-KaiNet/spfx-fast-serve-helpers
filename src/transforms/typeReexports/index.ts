import { readFileSync } from 'node:fs';
import path from 'node:path';
import { init } from 'es-module-lexer';
import type { DevEnvironment, Plugin } from 'vite';
import type { ServeContext } from '../../context.js';
import { isInside, toPosix, toRootUrl } from '../../utils/paths.js';
import { isProjectScript, NODE_MODULES_ID, PROJECT_SCRIPT_ID } from '../projectSource.js';
import { formatTypeReexportMessage } from './message.js';
import { collectRuntimeExports, findValueReexports, groupBy, removeReexports, type ValueReexport } from './reexports.js';

const EXPORT_LIST = /\bexport\s*\{/;
const VIRTUAL_ID_PREFIX = '\0';
const VIRTUAL_URL_PREFIX = '/@id/__x00__';

export interface RuntimeExports {
  readonly names: ReadonlySet<string>;
  readonly complete: boolean;
}

const UNKNOWN_EXPORTS: RuntimeExports = { names: new Set(), complete: false };

export function typeReexportGuardPlugin({ root, logger }: Pick<ServeContext, 'root' | 'logger'>): Plugin {
  const modulesBeingChecked = new Set<string>();
  const reportedMessages = new Map<string, string>();

  const report = (id: string, message: string) => {
    if (reportedMessages.get(id) === message) return;
    reportedMessages.set(id, message);
    logger.error(message);
  };

  return {
    name: 'fast-serve:type-reexports',
    apply: 'serve',
    transform: {
      filter: { id: { include: PROJECT_SCRIPT_ID, exclude: NODE_MODULES_ID }, code: EXPORT_LIST },
      async handler(code, id) {
        const environment = this.environment;
        if (environment.mode !== 'dev' || !isProjectScript(root, id)) return null;
        await init();
        const reexports = findValueReexports(code);
        if (reexports.length === 0) {
          reportedMessages.delete(id);
          return null;
        }

        const importerUrl = toRootUrl(root, id);
        modulesBeingChecked.add(importerUrl);
        try {
          const missing = await findMissingReexports(root, reexports, {
            resolve: (from) => this.resolve(from, id),
            runtimeExportsOf: (request) => readRuntimeExports(environment, request, modulesBeingChecked),
          });
          if (missing.length === 0) {
            reportedMessages.delete(id);
            return null;
          }
          const described = missing.map(({ reexport, target }) => ({ name: reexport.importedName, from: reexport.from, target }));
          const message = formatTypeReexportMessage(root, id, readSource(id, code), described);
          report(id, message);
          const output = removeReexports(
            code,
            missing.map(({ reexport }) => reexport),
          );
          output.prepend(`console.error(${JSON.stringify(`[fast-serve] ${message}`)});\n`);
          return { code: output.toString(), map: output.generateMap({ hires: 'boundary', source: id, includeContent: true }) };
        } finally {
          modulesBeingChecked.delete(importerUrl);
        }
      },
    },
  };

}

interface ReexportLookup {
  resolve(from: string): Promise<{ id: string; external: boolean | 'absolute' | 'relative' } | null>;
  runtimeExportsOf(request: string): Promise<RuntimeExports>;
}

async function findMissingReexports(root: string, reexports: readonly ValueReexport[], lookup: ReexportLookup): Promise<{ reexport: ValueReexport; target: string }[]> {
  const groups = await Promise.all(
    [...groupBy(reexports, (reexport) => reexport.from)].map(async ([from, group]) => {
      const resolved = await lookup.resolve(from);
      const request = resolved && !resolved.external ? checkableRequest(root, resolved.id) : undefined;
      if (!resolved || !request) return [];
      const provided = await lookup.runtimeExportsOf(request);
      if (!provided.complete) return [];
      const target = displayTarget(root, resolved.id);
      return group.filter((reexport) => !provided.names.has(reexport.importedName)).map((reexport) => ({ reexport, target }));
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
  const file = stripQuery(id);
  return path.isAbsolute(file) && isInside(root, file) && !NODE_MODULES_ID.test(file) ? toRootUrl(root, file) : undefined;
}

function checkableStarRequest(source: string): string | undefined {
  const url = stripQuery(source);
  if (url.startsWith(VIRTUAL_URL_PREFIX)) return VIRTUAL_ID_PREFIX + url.slice(VIRTUAL_URL_PREFIX.length);
  if (!url.startsWith('/') || url.startsWith('/@') || url.includes('/node_modules/')) return undefined;
  return url;
}

function readSource(id: string, fallback: string): string {
  try {
    return readFileSync(stripQuery(id), 'utf8');
  } catch {
    return fallback;
  }
}

function displayTarget(root: string, id: string): string {
  if (id.startsWith(VIRTUAL_ID_PREFIX)) return id.slice(VIRTUAL_ID_PREFIX.length);
  return toPosix(path.relative(root, stripQuery(id)));
}

function stripQuery(id: string): string {
  const queryStart = id.indexOf('?');
  return queryStart === -1 ? id : id.slice(0, queryStart);
}
