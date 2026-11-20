export type ServerStopper = () => void;

export interface StartedServer {
  readonly firstCompile: Promise<void>;
  onStop(stopper: ServerStopper): void;
}

export type ServerStartedHook = (server: StartedServer) => void;

export type PageScript = () => string;

export interface PageChannel {
  reloadPages(): void;
  addPageScript(script: PageScript): void;
  pageScripts(): string;
  onServerStarted(hook: ServerStartedHook): void;
}
