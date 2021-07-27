export interface Settings {
  $schema: string,
  cli: {
    isLibraryComponent: boolean;
    port?: number;
  }

  serve?: {
    openUrl?: string;
    fullScreenErrors: boolean;
    loggingLevel: 'minimal' | 'normal' | 'detailed';
    hotRefresh: boolean;
  }
}
