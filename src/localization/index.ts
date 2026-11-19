import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';

export function localizationContribution({ project, options }: BuildContext): ConfigContribution {
  const alias: Record<string, string> = {};
  for (const resource of project.localizedResources(options.locale).values()) alias[`${resource.name}$`] = resource.file;
  return { alias };
}
