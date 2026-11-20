import type { PageChannel, PageScript, ServerStartedHook, StartedServer } from '../featureApi/index.js';

export interface PageServer extends StartedServer {
  reloadPages(): void;
}

export interface ServedPageChannel extends PageChannel {
  serverStarted(server: PageServer): void;
}

export function createPageChannel(): ServedPageChannel {
  const scripts: PageScript[] = [];
  const startedHooks: ServerStartedHook[] = [];
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
  };
}
