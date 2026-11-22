import { assetsFeature } from '../assets/index.js';
import { browserErrorsFeature } from '../browserErrors/index.js';
import { definesFeature } from '../defines/index.js';
import { entriesFeature } from '../entries/index.js';
import { externalsFeature } from '../externals/index.js';
import type { ConfigContribution, Feature, FeatureContext } from '../featureApi/index.js';
import { hmrFeature } from '../hmr/index.js';
import { localLibrariesFeature } from '../libraries/index.js';
import { lintFeature } from '../lint/index.js';
import { localizationFeature } from '../localization/index.js';
import { manifestsFeature } from '../manifests/index.js';
import { reactFeature } from '../react/index.js';
import { stylesFeature } from '../styles/index.js';
import { tunnelFeature } from '../tunnel/index.js';
import { typeCheckFeature } from '../typeCheck/index.js';
import { typescriptFeature } from '../typescript/index.js';

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
