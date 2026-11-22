import type { PageChannel, PageScript, ServerStartedHook, StartedServer, TypingsListener } from './featureApi/index.js';

export interface PageServer extends StartedServer {
  reloadPages(): void;
}

export interface ServedPageChannel extends PageChannel {
  serverStarted(server: PageServer): void;
}

export function createPageChannel(): ServedPageChannel {
  const scripts: PageScript[] = [];
  const startedHooks: ServerStartedHook[] = [];
  const typingsListeners: TypingsListener[] = [];
  let server: PageServer | undefined;
  return {
    reloadPages: () => {
      server?.reloadPages();
    },
    addPageScript: (script) => {
      scripts.push(script);
    },
    pageScripts: () => scripts.map((script) => script()).join(''),
    onServerStarted: (hook) => {
      startedHooks.push(hook);
    },
    serverStarted: (started) => {
      server = started;
      for (const hook of startedHooks) hook(started);
    },
    typingsUpdated: (update) => {
      for (const listener of typingsListeners) listener(update);
    },
    onTypingsUpdated: (listener) => {
      typingsListeners.push(listener);
    },
  };
}
