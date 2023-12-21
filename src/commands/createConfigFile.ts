import { configFileName } from '../common/consts';
import { Logger } from '../common/logger';
import { Config, createTemplateFile } from './helpers';

export async function createConfigFile(config: Config): Promise<void> {
  try {
    await createTemplateFile(configFileName, config);
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
