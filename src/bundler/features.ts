import { assetsFeature } from '../features/build/assets/index.js';
import { browserErrorsFeature } from '../features/devtools/browserErrors/index.js';
import { definesFeature } from '../features/build/defines.js';
import { entriesFeature } from '../features/build/entries.js';
import { externalsFeature } from '../features/build/externals/index.js';
import type { ConfigContribution, Feature, FeatureContext } from './featureApi/index.js';
import { hmrFeature } from '../features/devtools/hmr/index.js';
import { localLibrariesFeature } from '../features/build/localLibraries.js';
import { lintFeature } from '../features/devtools/lint/index.js';
import { localizationFeature } from '../features/build/localization/index.js';
import { manifestsFeature } from '../features/build/manifests/index.js';
import { reactFeature } from '../features/build/react.js';
import { stylesFeature } from '../features/build/styles/index.js';
import { tunnelFeature } from '../features/devtools/tunnel/index.js';
import { typeCheckFeature } from '../features/devtools/typeCheck/index.js';
import { typescriptFeature } from '../features/build/typescript/index.js';

export const FEATURES: readonly Feature[] = [
  entriesFeature,
  localLibrariesFeature,
  typescriptFeature,
  externalsFeature,
  reactFeature,
  localizationFeature,
  assetsFeature,
  stylesFeature,
  definesFeature,
  manifestsFeature,
  browserErrorsFeature,
  tunnelFeature,
  hmrFeature,
  typeCheckFeature,
  lintFeature,
];

export async function contributionsInFeatureOrder(features: readonly Feature[], context: FeatureContext): Promise<ConfigContribution[]> {
  const [first, ...rest] = features;
  if (first === undefined) return [];
  const contribution = await first.contribute(context);
  return [contribution, ...(await contributionsInFeatureOrder(rest, context))];
}
