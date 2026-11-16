import { MANIFESTS_PATH } from '../manifests/index.js';

export function debugQuery(origin: string): string {
  return `debugManifestsFile=${encodeURIComponent(origin + MANIFESTS_PATH)}&debug=true&noredir=true`;
}

export function debugPageUrl(pageUrl: string, origin: string): string {
  const hashIndex = pageUrl.indexOf('#');
  const base = hashIndex === -1 ? pageUrl : pageUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : pageUrl.slice(hashIndex);
  const separator = base.includes('?') ? (base.endsWith('?') || base.endsWith('&') ? '' : '&') : '?';
  return `${base}${separator}${debugQuery(origin)}${hash}`;
}
