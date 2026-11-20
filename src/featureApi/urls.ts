export const DIST_PATH = '/dist/';
export const MANIFESTS_PATH = '/temp/build/manifests.js';
export const BROWSER_ERRORS_PATH = '/fast-serve/browser-errors';

export function publicPath(origin: string): string {
  return `${origin}${DIST_PATH}`;
}
