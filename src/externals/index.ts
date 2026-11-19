import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';

export function externalsContribution({ project }: BuildContext): ConfigContribution {
  return { externals: [...project.libraries().keys()].toSorted() };
}
