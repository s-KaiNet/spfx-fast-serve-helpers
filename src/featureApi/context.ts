import type { ResolvedOptions } from '../config/index.js';
import type { Logger } from '../logger.js';
import type { SpfxProject } from '../project/index.js';
import type { PageChannel } from './pageChannel.js';

export interface BuildContext {
  readonly root: string;
  readonly project: SpfxProject;
  readonly options: Pick<ResolvedOptions, 'origin' | 'locale' | 'overlay'>;
  readonly logger: Logger;
}

export interface FeatureContext extends BuildContext {
  readonly page: PageChannel;
}
