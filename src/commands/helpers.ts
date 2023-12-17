import * as fs from 'fs';
import * as path from 'path';
import { ensureFastServeFolder, getTemplatesPath } from '../common/helpers';
import { fastFolderName } from '../common/consts';
import { readFile, writeFile } from 'fs/promises';
import { Logger } from '../common/logger';

export type Config = { force: boolean };

export async function createTemplateFile(extendFileName: string, config: Config) {
  ensureFastServeFolder();

  const filePath = path.join(process.cwd(), fastFolderName, extendFileName);

  const fileContent = (await readFile(getTemplatesPath(extendFileName))).toString();

  if (!fs.existsSync(filePath) || config.force) {
    await writeFile(filePath, fileContent);
    Logger.log(`Created ${extendFileName} file.`);
    Logger.log(`Path: ${filePath}`);
  } else {
    Logger.log(`${extendFileName} file already exists. Use --force to overwrite it with the default one.`);
    Logger.log(`Path: ${filePath}`);
  }
}
