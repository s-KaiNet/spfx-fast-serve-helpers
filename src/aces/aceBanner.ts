import type { SpfxComponent } from '../project/index.js';

export const ACE_COMPONENT_TYPE = 'AdaptiveCardExtension';
export const ACE_PAGE_HINT = 'add Adaptive Card Extensions from the toolbox in edit mode; card actions and quick views work in read mode, on a saved page';

export function aceBannerLines(components: readonly SpfxComponent[], webPartQueryIfDifferent: string | undefined): string[] {
  if (!components.some(({ manifest }) => manifest.componentType === ACE_COMPONENT_TYPE)) return [];
  if (webPartQueryIfDifferent === undefined) return [ACE_PAGE_HINT];
  return [ACE_PAGE_HINT, `to add them, open a SharePoint page with the web-part debug query: ?${webPartQueryIfDifferent}`];
}
