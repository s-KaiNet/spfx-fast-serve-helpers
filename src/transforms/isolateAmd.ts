import { transformWithOxc, type Plugin, type Rolldown } from 'vite';
import type { ServeContext } from '../context.js';
import { toPosix } from '../utils/paths.js';
import { withoutQuery } from '../utils/vite.js';

const DEFINE_REFERENCE = /\bdefine\b/;
const AMD_DETECTION = /\bamd\b/;
const DEPENDENCY_SCRIPT = /\.[cm]?js(?:\?.*)?$/;
const SERVED_DEPENDENCY_SCRIPT = /[\\/]node_modules[\\/].*\.[cm]?js(?:\?.*)?$/;
const VIRTUAL_MODULE = /^\0/;
const NODE_MODULES_SEGMENT = '/node_modules/';
const PREBUNDLE_PLUGIN_NAME = 'fast-serve:isolate-amd-prebundle';

export type HidesAmdDefine = (id: string) => boolean;

export function isolateAmdPlugin({ options }: Pick<ServeContext, 'options'>): Plugin {
  const hidesAmdDefine = amdIsolationFilter(options.amdPackages);
  const prebundlePlugin: Rolldown.Plugin = {
    name: prebundlePluginName(options.amdPackages),
    transform: {
      filter: { id: { include: DEPENDENCY_SCRIPT, exclude: VIRTUAL_MODULE }, code: DEFINE_REFERENCE },
      handler: (code, id) => (hidesAmdDefine(id) ? hideAmdDefine(code, id) : null),
    },
  };
  let optimizedDepsDir = '';
  return {
    name: 'fast-serve:isolate-amd',
    apply: 'serve',
    config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [prebundlePlugin] } } }),
    configResolved(config) {
      optimizedDepsDir = `${toPosix(config.cacheDir)}/`;
    },
    transform: {
      filter: { id: { include: SERVED_DEPENDENCY_SCRIPT, exclude: VIRTUAL_MODULE }, code: DEFINE_REFERENCE },
      handler(code, id) {
        if (toPosix(id).startsWith(optimizedDepsDir) || !hidesAmdDefine(id)) return null;
        return hideAmdDefine(code, id);
      },
    },
  };
}

export function prebundlePluginName(amdPackages: readonly string[]): string {
  return amdPackages.length === 0 ? PREBUNDLE_PLUGIN_NAME : `${PREBUNDLE_PLUGIN_NAME}(keeps ${[...new Set(amdPackages)].toSorted().join(', ')})`;
}

export function amdIsolationFilter(amdPackages: readonly string[]): HidesAmdDefine {
  const optedOut = new Set(amdPackages);
  return (id) => {
    const packageName = dependencyPackageName(id);
    return packageName === undefined || !optedOut.has(packageName);
  };
}

export async function hideAmdDefine(code: string, id: string): Promise<{ code: string; map: Rolldown.SourceMapInput } | null> {
  if (!AMD_DETECTION.test(code)) return null;
  try {
    const result = await transformWithOxc(code, withoutQuery(id), {
      lang: 'js',
      sourceType: 'unambiguous',
      tsconfig: { compilerOptions: {} },
      define: { define: 'undefined' },
    });
    return { code: result.code, map: result.map ?? null };
  } catch {
    return null;
  }
}

export function dependencyPackageName(id: string): string | undefined {
  const file = withoutQuery(id).replaceAll('\\', '/');
  const index = file.lastIndexOf(NODE_MODULES_SEGMENT);
  if (index < 0) return undefined;
  const [first, second] = file.slice(index + NODE_MODULES_SEGMENT.length).split('/');
  return first?.startsWith('@') && second !== undefined ? `${first}/${second}` : first;
}
