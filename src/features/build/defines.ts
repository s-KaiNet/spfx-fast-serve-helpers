import { rspack } from '@rspack/core';
import type { ConfigContribution, Feature } from '../../bundler/featureApi/index.js';

export const DEFINES: Record<string, string> = {
  DEBUG: 'true',
  'process.env.NODE_ENV': JSON.stringify('development'),
};

export const definesFeature: Feature = { name: 'defines', contribute: definesContribution };

function definesContribution(): ConfigContribution {
  return { plugins: [new rspack.DefinePlugin(DEFINES)] };
}
