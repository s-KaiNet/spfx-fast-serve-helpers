import { MANIFESTS_PATH } from '../manifests/index.js';
import type { ServeConfiguration } from '../project/index.js';

const FORM_CUSTOMIZER_JSON_PARAMETERS = new Set(['properties']);
const FORM_CUSTOMIZER_DECODED_PARAMETERS = new Set(['RootFolder']);

export function debugQuery(origin: string, serveConfiguration: ServeConfiguration = {}): string {
  const params = new URLSearchParams({
    debugManifestsFile: origin + MANIFESTS_PATH,
    debug: 'true',
    noredir: 'true',
  });
  const { customActions, fieldCustomizers, formCustomizer } = serveConfiguration;
  if (!customActions && !fieldCustomizers && !formCustomizer) return params.toString();

  params.set('loadSPFX', 'true');
  if (customActions) params.set('customActions', JSON.stringify(customActions));
  if (fieldCustomizers) params.set('fieldCustomizers', JSON.stringify(fieldCustomizers));
  for (const [name, value] of Object.entries(formCustomizer ?? {})) {
    if (value === undefined || value === null || value === '' || value === 0 || value === false) continue;
    params.set(name, formCustomizerParameterValue(name, value));
  }
  params.delete('debug');
  return params.toString();
}

function formCustomizerParameterValue(name: string, value: unknown): string {
  if (FORM_CUSTOMIZER_JSON_PARAMETERS.has(name)) return JSON.stringify(value);
  if (FORM_CUSTOMIZER_DECODED_PARAMETERS.has(name)) return decodeURIComponent(String(value));
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function debugPageUrl(pageUrl: string, origin: string, serveConfiguration?: ServeConfiguration): string {
  const hashIndex = pageUrl.indexOf('#');
  const base = hashIndex === -1 ? pageUrl : pageUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : pageUrl.slice(hashIndex);
  const separator = base.includes('?') ? (base.endsWith('?') || base.endsWith('&') ? '' : '&') : '?';
  return `${base}${separator}${debugQuery(origin, serveConfiguration)}${hash}`;
}
