import { loadRuntimeSource } from '../utils/runtimeSource.js';
import type { PageRuntimeConfig } from './contracts.js';

const INSTALL_FUNCTION = 'installFastServePage';

let runtimeSource: string | undefined;

export function pageRuntimeSource(): string {
  runtimeSource ??= loadRuntimeSource('./runtime/pageRuntime', import.meta.url);
  return runtimeSource;
}

export function renderPageScript(config: PageRuntimeConfig): string {
  return [
    '(function () {',
    "if (typeof window !== 'object' || typeof document !== 'object') return;",
    pageRuntimeSource(),
    `try { ${INSTALL_FUNCTION}(${JSON.stringify(config)}); } catch (error) { console.warn('[fast-serve] browser error forwarding is off:', error); }`,
    '})();',
    '',
  ].join('\n');
}
