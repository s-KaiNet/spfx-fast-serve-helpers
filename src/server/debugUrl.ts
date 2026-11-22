import { MANIFESTS_PATH } from '../featureApi/index.js';
import type { ServeConfiguration } from '../project/index.js';

const FORM_CUSTOMIZER_JSON_PARAMETERS = new Set(['properties']);
const FORM_CUSTOMIZER_DECODED_PARAMETERS = new Set(['RootFolder']);

const CHARACTERS_TO_KEEP_ENCODED = /[\s%&#+]/gu;

export function debugQuery(origin: string, serveConfiguration: ServeConfiguration = {}): string {
  return debugQueryParameters(origin, serveConfiguration).toString();
}

export function readableDebugQuery(origin: string, serveConfiguration: ServeConfiguration = {}): string {
  return [...debugQueryParameters(origin, serveConfiguration)].map(([name, value]) => `${readable(name)}=${readable(value)}`).join('&');
}

export function loadsExtensions({ customActions, fieldCustomizers, formCustomizer }: ServeConfiguration): boolean {
  return Boolean(customActions ?? fieldCustomizers ?? formCustomizer);
}

function readable(text: string): string {
  return text.replaceAll(CHARACTERS_TO_KEEP_ENCODED, (character) => encodeURIComponent(character));
}

function debugQueryParameters(origin: string, serveConfiguration: ServeConfiguration): URLSearchParams {
  const params = new URLSearchParams({
    debugManifestsFile: origin + MANIFESTS_PATH,
    debug: 'true',
    noredir: 'true',
  });
  if (!loadsExtensions(serveConfiguration)) return params;
  const { customActions, fieldCustomizers, formCustomizer } = serveConfiguration;

  params.set('loadSPFX', 'true');
  if (customActions) params.set('customActions', JSON.stringify(customActions));
  if (fieldCustomizers) params.set('fieldCustomizers', JSON.stringify(fieldCustomizers));
  for (const [name, value] of Object.entries(formCustomizer ?? {})) {
    if (value === undefined || value === null || value === '' || value === 0 || value === false) continue;
    params.set(name, formCustomizerParameterValue(name, value));
  }
  params.delete('debug');
  return params;
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
  const withoutHash = hashIndex === -1 ? pageUrl : pageUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : pageUrl.slice(hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  return `${base}?${debugQuery(origin, serveConfiguration)}${hash}`;
}
