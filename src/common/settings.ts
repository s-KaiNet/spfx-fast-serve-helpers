export interface Settings {
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
    debug: boolean;
  }
}
