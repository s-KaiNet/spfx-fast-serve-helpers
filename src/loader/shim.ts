import type { SpfxBundle } from '../project/index.js';
import type { BundleShimConfig, ShimExternalsConfig } from '../runtime/contracts.js';
import { readRuntimeSource } from '../utils/runtimeSource.js';
import { bundleEntryPath } from './paths.js';

export function createShimConfig(bundle: SpfxBundle, origin: string, externals: ShimExternalsConfig): BundleShimConfig {
  return {
    bundleName: bundle.name,
    origin,
    entryPath: bundleEntryPath(bundle.name),
    components: bundle.components.map(({ manifest }) => ({
      alias: manifest.alias,
      moduleId: `${manifest.id}_${manifest.version}`,
    })),
    externals,
  };
}

export async function renderShim(config: BundleShimConfig): Promise<string> {
  const runtime = await readRuntimeSource('componentShim');
  return [
    '(function () {',
    `var __SPFX_BUNDLE__ = ${JSON.stringify(config, null, 2)};`,
    runtime.trim(),
    '})();',
    '',
  ].join('\n');
}
