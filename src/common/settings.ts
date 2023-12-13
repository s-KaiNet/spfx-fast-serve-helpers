export interface Settings {
  $schema: string,
  cli: {
    isLibraryComponent: boolean;
    port?: number;
  }

  serve?: {
    openUrl?: string;
    eslint: boolean;
    fullScreenErrors: boolean;
    loggingLevel: 'minimal' | 'normal' | 'detailed';
    hotRefresh: boolean;
    reactProfiling: boolean;
    containers: boolean;
  }
}


export interface Settings2 {
  serve?: {
    memory: number;
    isLibraryComponent: boolean;
    locale: string;
    config: string;
    openUrl?: string;
    loggingLevel: 'minimal' | 'normal' | 'detailed';
    fullScreenErrors: boolean;
    eslint: boolean;
    hotRefresh: boolean;
    reactProfiling: boolean;
    containers: boolean;
    port: number;
  }
}
