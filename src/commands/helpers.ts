import * as fs from 'fs';
import * as path from 'path';
import { ensureFastServeFolder, getTemplatesPath } from '../common/helpers';
import { fastFolderName } from '../common/consts';
import { readFile, writeFile } from 'fs/promises';
import { Logger } from '../common/logger';

export type Config = { force: boolean };

export async function createTemplateFile(fileNameToCreate: string, config: Config) {
  ensureFastServeFolder();

  const filePath = path.join(process.cwd(), fastFolderName, fileNameToCreate);

  const fileContent = (await readFile(getTemplatesPath(fileNameToCreate))).toString();

  if (!fs.existsSync(filePath) || config.force) {

    await writeFile(filePath, fileContent);
    
    Logger.log(`Created ${fileNameToCreate} file.`);
    Logger.log(`Path: ${filePath}`);
  } else {
    Logger.log(`${fileNameToCreate} file already exists. Use --force to overwrite it with the default one.`);
    Logger.log(`Path: ${filePath}`);
  }
}
