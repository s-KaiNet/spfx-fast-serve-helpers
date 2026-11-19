import type { ResolvedOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import type { SpfxProject } from '../project/index.js';

export interface BuildContext {
  readonly root: string;
  readonly project: SpfxProject;
  readonly options: Pick<ResolvedOptions, 'origin' | 'locale'>;
  readonly logger: Logger;
}

export const DIST_PATH = '/dist/';

export function publicPathOf(context: BuildContext): string {
  return `${context.options.origin}${DIST_PATH}`;
}
