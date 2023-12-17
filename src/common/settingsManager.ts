import { program } from 'commander';
import { getJSONFile } from './helpers';
import { Settings } from './settings';

export let serveSettings: Settings['serve'];

export function initSettings(cliSettings: Settings['serve']) {

  const defaultServeSettings: Record<string, any> = {};
  const explicitServeSettings: Record<string, any> = {};

  for (const key in cliSettings) {
    if (Object.prototype.hasOwnProperty.call(cliSettings, key)) {
      if (program.getOptionValueSource(key) === 'default') {
        defaultServeSettings[key] = cliSettings[key as keyof Settings['serve']];
      }

      if (program.getOptionValueSource(key) === 'cli') {
        explicitServeSettings[key] = cliSettings[key as keyof Settings['serve']];
      }
    }
  }

  const fileBasedSettings = getJSONFile<Settings>('fast-serve/config.json') ?? {} as any;
  fileBasedSettings.serve = fileBasedSettings.serve ?? {} as any;

  if ((fileBasedSettings as any).cli?.isLibraryComponent != null) {
    fileBasedSettings.serve.isLibraryComponent = (fileBasedSettings as any).cli.isLibraryComponent;
  }

  if ((fileBasedSettings as any).cli?.port != null) {
    fileBasedSettings.serve.port = (fileBasedSettings as any).cli.port;
  }

  serveSettings = {
    ...defaultServeSettings,
    ...fileBasedSettings.serve,
    ...explicitServeSettings,
  }
}
