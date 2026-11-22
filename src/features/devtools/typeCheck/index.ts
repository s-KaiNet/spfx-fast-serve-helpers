import { TYPE_CHECK_EVENTS_PATH, type ConfigContribution, type Feature, type FeatureContext } from '../../../bundler/featureApi/index.js';
import { createTypeCheckEvents } from './events.js';
import { TypeCheckPlugin } from './plugin.js';
import { findProjectTypeScript } from './projectTypeScript.js';

export { checkerOptions, TS_BUILD_INFO_FILE } from './checkerOptions.js';
export { createTypeCheckEvents, overlayContent, type OverlayContent, type TypeCheckEvents } from './events.js';
export { createIssuesChangeDetector, formatIssue, issuesKey, MAX_LISTED_ISSUES, typeCheckResult, typeCheckSummary, type TypeCheckResult, type TypeIssue } from './issues.js';
export { otherCheckerName, printTypeCheckResult, TypeCheckPlugin, type TypeCheckPluginOptions } from './plugin.js';
export { findProjectTypeScript, type ProjectTypeScript } from './projectTypeScript.js';

export const typeCheckFeature: Feature = { name: 'typeCheck', contribute: typeCheckContribution };

export function typeCheckEventsUrl({ root, options }: Pick<FeatureContext, 'root' | 'options'>): string | undefined {
  if (options.typeCheck !== true || !options.overlay || !findProjectTypeScript(root).found) return undefined;
  return `${options.origin}${TYPE_CHECK_EVENTS_PATH}`;
}

function typeCheckContribution({ root, options, logger, page }: FeatureContext): ConfigContribution {
  if (options.typeCheck !== true) return {};
  const typescript = findProjectTypeScript(root);
  if (!typescript.found) {
    logger[typescript.level](`type check is off: ${typescript.reason}`);
    return {};
  }
  const events = options.overlay ? createTypeCheckEvents(page) : undefined;
  const plugin = new TypeCheckPlugin({
    root,
    typescriptPath: typescript.path,
    logger,
    page,
    ...(events === undefined ? {} : {
          onResult: (result) => {
            events.publish(result);
          },
        }),
  });
  return { plugins: [plugin], middlewares: events === undefined ? [] : [events.middleware] };
}
