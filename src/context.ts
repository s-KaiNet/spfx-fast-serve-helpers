import type { ResolvedOptions } from './config/options.js';
import type { Logger } from './logger.js';
import type { SpfxProject } from './project/index.js';

export interface ServeContext {
  readonly root: string;
  readonly options: ResolvedOptions;
  readonly project: SpfxProject;
  readonly logger: Logger;
}
