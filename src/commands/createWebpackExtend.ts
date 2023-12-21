import { Logger } from '../common/logger';
import { extendFileName } from '../common/consts';
import { Config, createTemplateFile } from './helpers';

export async function createWebpackExtend(config: Config): Promise<void> {
  try {
    await createTemplateFile(extendFileName, config);
  }
  catch (error) {
    if (error) {
      Logger.error(error?.message || error.toString());
      throw error;
    } else {
      Logger.error('The process exited with an error');
      process.exit(1);
    }
  }
}
