interface ImportMeta {
  readonly webpackHot?: {
    addStatusHandler(handler: (status: string) => void): void;
  };
}
