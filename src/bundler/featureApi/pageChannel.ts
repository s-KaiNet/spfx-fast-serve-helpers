export type ServerStopper = () => void;

export interface StartedServer {
  readonly firstCompile: Promise<void>;
  onStop(stopper: ServerStopper): void;
}

export type ServerStartedHook = (server: StartedServer) => void;

export type PageScript = () => string;

export interface TypingsUpdate {
  readonly written: readonly string[];
  readonly removed: readonly string[];
}

export type TypingsListener = (update: TypingsUpdate) => void;

export interface PageChannel {
  reloadPages(): void;
  addPageScript(script: PageScript): void;
  pageScripts(): string;
  onServerStarted(hook: ServerStartedHook): void;
  typingsUpdated(update: TypingsUpdate): void;
  onTypingsUpdated(listener: TypingsListener): void;
}
