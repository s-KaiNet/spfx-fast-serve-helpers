import type { Plugin } from 'vite';
import { readRuntimeSource, runtimeFilePath } from '../utils/runtimeSource.js';
import { isStyleRequest } from '../utils/vite.js';

export { libraryCssPlugin } from './libraryCss/index.js';

const THEMED_STYLES_ID = 'virtual:fast-serve/themed-styles';
const RESOLVED_THEMED_STYLES_ID = '\0' + THEMED_STYLES_ID;

const THEMED_STYLES_URL = '/@id/__x00__' + THEMED_STYLES_ID;
const VITE_STYLE_IMPORT =
  /(import \{ updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle \} from )"[^"]*"/;

export function stylesPlugin(): Plugin {
  return {
    name: 'fast-serve:styles',
    config: () => ({
      css: {
        devSourcemap: true,
        modules: { localsConvention: 'camelCase', generateScopedName: '[local]_[hash:base64:8]' },
      },
      resolve: {
        alias: [{ find: /^~(?=[@\w])/, replacement: '' }],
      },
    }),
    resolveId: (source) => (source === THEMED_STYLES_ID ? RESOLVED_THEMED_STYLES_ID : null),
    load(id) {
      if (id !== RESOLVED_THEMED_STYLES_ID) return null;
      this.addWatchFile(runtimeFilePath('themedStyles'));
      return readRuntimeSource('themedStyles');
    },
    transform: {
      order: 'post',
      handler(code, id) {
        if (!isStyleRequest(id) || !code.includes('__vite__updateStyle')) return null;
        const replaced = code.replace(VITE_STYLE_IMPORT, `$1${JSON.stringify(THEMED_STYLES_URL)}`);
        return replaced === code ? null : { code: replaced, map: null };
      },
    },
  };
}
