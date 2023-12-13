import { getJSONFile } from "../webpack/helpers";
import { Settings2 } from "./settings";
import { program } from 'commander';

export function initSettings() {
  const defaultSettings: Settings2 = {
    serve: {
      eslint: true,
      fullScreenErrors: true,
      loggingLevel: 'normal',
      hotRefresh: false,
      openUrl: undefined,
      reactProfiling: false,
      containers: undefined,
      config: undefined,
      locale: undefined,
      memory: 8192,
      isLibraryComponent: false,
      port: 4321
    }
  };

  const fileBasedSettings = getJSONFile<Settings2>('fast-serve/config.json') ?? {};
  fileBasedSettings.serve = fileBasedSettings.serve ?? {} as any;

  if ((fileBasedSettings as any).cli?.isLibraryComponent != null) {
    fileBasedSettings.serve.isLibraryComponent = (fileBasedSettings as any).cli.isLibraryComponent;
  }

  if ((fileBasedSettings as any).cli?.port != null) {
    fileBasedSettings.serve.port = (fileBasedSettings as any).cli.port;
  }



}