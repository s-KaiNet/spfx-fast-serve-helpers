import { rspack } from '@rspack/core';
import type { ConfigContribution } from '../rspack/contribution.js';

export const DEFINES: Record<string, string> = {
  DEBUG: 'true',
  'process.env.NODE_ENV': JSON.stringify('development'),
};

export function definesContribution(): ConfigContribution {
  return { plugins: [new rspack.DefinePlugin(DEFINES)] };
}
