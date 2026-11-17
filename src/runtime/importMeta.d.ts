interface ImportMetaHot {
  send(event: string, data?: unknown): void;
}

interface ImportMeta {
  readonly hot?: ImportMetaHot;
}
