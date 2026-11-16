import type { SpfxBundle } from '../project/index.js';

export function createServedBundles(warn: (message: string) => void): (bundles: SpfxBundle[]) => SpfxBundle[] {
  const reported = new Set<string>();
  return (bundles) =>
    bundles.map((bundle) => {
      const [first, ...rest] = bundle.components;
      if (!first || rest.length === 0) return bundle;
      const key = `${bundle.name}:${rest.map((c) => c.manifest.alias).join(',')}`;
      if (!reported.has(key)) {
        reported.add(key);
        warn(
          `bundle "${bundle.name}" has ${bundle.components.length} components; only ${first.manifest.alias} is served ` +
            '(bundles with several components are not supported yet)',
        );
      }
      return { ...bundle, components: [first] };
    });
}
