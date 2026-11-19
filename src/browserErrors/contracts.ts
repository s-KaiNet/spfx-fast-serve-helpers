export type BrowserErrorKind = 'error' | 'unhandled-rejection' | 'console-error' | 'load-error';

export interface BrowserErrorReport {
  kind: BrowserErrorKind;
  name: string;
  message: string;
  stack: string;
  callStack: string;
  bundle?: string;
  requireType?: string;
  requireModules?: string[];
}

export interface OverlayContent {
  title: string;
  text: string;
}

export interface BrowserErrorResponse {
  overlay?: OverlayContent;
  pageMessage?: string;
}

export interface PageRuntimeConfig {
  origin: string;
  distUrl: string;
  reportUrl: string;
  overlay: boolean;
  bundles: Record<string, string[]>;
}
