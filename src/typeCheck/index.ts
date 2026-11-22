import type { ConfigContribution, Feature, FeatureContext } from '../featureApi/index.js';
import { createTypeCheckOverlay } from './overlay.js';
import { TypeCheckPlugin } from './plugin.js';
import { findProjectTypeScript } from './projectTypeScript.js';

export { checkerOptions, TS_BUILD_INFO_FILE } from './checkerOptions.js';
export { createIssuesChangeDetector, formatIssue, issuesKey, MAX_LISTED_ISSUES, typeCheckResult, typeCheckSummary, type TypeCheckResult, type TypeIssue } from './issues.js';
export { createTypeCheckOverlay, overlayContent, renderTypeCheckOverlayScript, type OverlayContent, type TypeCheckOverlay } from './overlay.js';
export { otherCheckerName, printTypeCheckResult, TypeCheckPlugin, type TypeCheckPluginOptions } from './plugin.js';
export { findProjectTypeScript, type ProjectTypeScript } from './projectTypeScript.js';

export const typeCheckFeature: Feature = { name: 'typeCheck', contribute: typeCheckContribution };

function typeCheckContribution({ root, options, logger, page }: FeatureContext): ConfigContribution {
  if (options.typeCheck !== true) return {};
  const typescript = findProjectTypeScript(root);
  if (!typescript.found) {
    logger.warn(`type check is off: ${typescript.reason}`);
    return {};
  }
  const overlay = options.typeCheckOverlay === true ? createTypeCheckOverlay(options.origin, page) : undefined;
  const plugin = new TypeCheckPlugin({
    root,
    typescriptPath: typescript.path,
    logger,
    page,
    ...(overlay === undefined ? {} : {
          onResult: (result) => {
            overlay.publish(result);
          },
        }),
  });
  return { plugins: [plugin], middlewares: overlay === undefined ? [] : [overlay.middleware] };
}
