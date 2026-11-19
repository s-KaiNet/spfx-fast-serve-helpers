import type { SpfxComponent } from '../project/index.js';
import { HOSTED_WORKBENCH_RETIREMENT, hostedWorkbenchUrl, isHostedWorkbench } from './hostedWorkbench.js';

export const ACE_COMPONENT_TYPE = 'AdaptiveCardExtension';

export function aceBannerLines(components: readonly SpfxComponent[], pageUrl: string | undefined, debugQuery: string): string[] {
  if (!components.some(({ manifest }) => manifest.componentType === ACE_COMPONENT_TYPE)) return [];
  const interaction = 'add Adaptive Card Extensions from the toolbox in edit mode; card actions and quick views work in preview/read mode';
  if (pageUrl === undefined || isHostedWorkbench(pageUrl)) return [interaction];
  const workbench = hostedWorkbenchUrl(pageUrl);
  if (workbench === undefined) return [interaction];
  return [interaction, `hosted workbench (keeps an unsaved canvas, retired on ${HOSTED_WORKBENCH_RETIREMENT}): ${workbench}?${debugQuery}`];
}
