import type { Plugin } from 'vite';
import { OPTIONS_FILE } from '../config/options.js';

const VITE_CLIENT_ID = /\/vite\/dist\/client\/client\.mjs$/;
const CONFIG_FILE_PLACEHOLDER = '__HMR_CONFIG_NAME__';
const VITE_OVERLAY_OPTION = '"server.hmr.overlay"';
export const OVERLAY_OPTION = 'overlay';

export function rewriteOverlayHint(clientCode: string): string {
  return clientCode.replaceAll(CONFIG_FILE_PLACEHOLDER, JSON.stringify(OPTIONS_FILE)).replaceAll(VITE_OVERLAY_OPTION, JSON.stringify(OVERLAY_OPTION));
}

export function overlayHintPlugin(): Plugin {
  return {
    name: 'fast-serve:overlay-hint',
    apply: 'serve',
    transform: {
      filter: { id: VITE_CLIENT_ID },
      handler: (code) => ({ code: rewriteOverlayHint(code), map: null }),
    },
  };
}
