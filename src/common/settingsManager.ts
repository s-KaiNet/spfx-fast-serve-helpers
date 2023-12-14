import { program } from 'commander';
import { getJSONFile } from './helpers';
import { Settings2 } from './settings';

export let serveSettings: Settings2['serve'];

export function initSettings(cliSettings: Settings2['serve']) {

  const defaultServeSettings: Record<string, any> = {};
  const explicitServeSettings: Record<string, any> = {};

  for (const key in cliSettings) {
    if (Object.prototype.hasOwnProperty.call(cliSettings, key)) {
      if (program.getOptionValueSource(key) === 'default') {
        defaultServeSettings[key] = cliSettings[key as keyof Settings2['serve']];
      }

      if (program.getOptionValueSource(key) === 'cli') {
        explicitServeSettings[key] = cliSettings[key as keyof Settings2['serve']];
      }
    }
  }

  const fileBasedSettings = getJSONFile<Settings2>('fast-serve/config.json') ?? {};
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
