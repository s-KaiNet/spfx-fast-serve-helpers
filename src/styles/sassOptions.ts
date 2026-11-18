import { createRequire } from 'node:module';
import path from 'node:path';
import type { CSSOptions } from 'vite';
import type { SassConfiguration } from '../project/index.js';

type PreprocessorOptions = NonNullable<CSSOptions['preprocessorOptions']>;

interface SassPackage {
  NodePackageImporter?: new (entryPointDirectory: string) => object;
}

const SASS_PACKAGES_IN_VITE_ORDER = ['sass-embedded', 'sass'];

export function sassPreprocessorOptions(
  { silenceDeprecations }: SassConfiguration,
  nodePackageImporter?: object,
): PreprocessorOptions | undefined {
  if (!silenceDeprecations && !nodePackageImporter) return undefined;
  const sassOptions = {
    ...(silenceDeprecations && { silenceDeprecations: [...silenceDeprecations] }),
    ...(nodePackageImporter && { importers: [nodePackageImporter] }),
  };
  return { scss: sassOptions, sass: sassOptions } as PreprocessorOptions;
}

export function createNodePackageImporter(root: string): object | undefined {
  const sass = loadSassPackageLikeVite(root);
  return sass?.NodePackageImporter ? new sass.NodePackageImporter(root) : undefined;
}

function loadSassPackageLikeVite(root: string): SassPackage | undefined {
  const requireFromProject = createRequire(path.join(root, 'package.json'));
  const requireFromVite = createRequire(createRequire(import.meta.url).resolve('vite/package.json'));
  for (const packageName of SASS_PACKAGES_IN_VITE_ORDER) {
    for (const load of [requireFromProject, requireFromVite]) {
      const sass = tryLoad(load, packageName);
      if (sass) return sass;
    }
  }
  return undefined;
}

function tryLoad(load: NodeJS.Require, packageName: string): SassPackage | undefined {
  try {
    return load(packageName) as SassPackage;
  } catch {
    return undefined;
  }
}
