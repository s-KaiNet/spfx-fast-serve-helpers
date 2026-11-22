import type { ResolvedOptions } from '../../config/index.js';
import type { Logger } from '../../shared/logger.js';
import type { SpfxProject } from '../../project/index.js';
import type { PageChannel } from './pageChannel.js';

export interface BuildContext {
  readonly root: string;
  readonly project: SpfxProject;
  readonly options: Pick<ResolvedOptions, 'origin' | 'locale' | 'overlay'> & Partial<Pick<ResolvedOptions, 'typeCheck' | 'lint'>> & { readonly tunnelHost?: string | undefined };
  readonly logger: Logger;
}

export interface FeatureContext extends BuildContext {
  readonly page: PageChannel;
}
