import type { CSSOptions, Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import type { SassConfiguration } from '../project/index.js';
import { readRuntimeSource, runtimeFilePath } from '../utils/runtimeSource.js';
import { isStyleRequest } from '../utils/vite.js';

export { libraryCssPlugin } from './libraryCss/index.js';
export { scssTypingsPlugin } from './scssTypings/index.js';

const THEMED_STYLES_ID = 'virtual:fast-serve/themed-styles';
const RESOLVED_THEMED_STYLES_ID = '\0' + THEMED_STYLES_ID;

const THEMED_STYLES_URL = '/@id/__x00__' + THEMED_STYLES_ID;
const VITE_STYLE_IMPORT =
  /(import \{ updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle \} from )"[^"]*"/;

type PreprocessorOptions = NonNullable<CSSOptions['preprocessorOptions']>;

export function sassPreprocessorOptions({ silenceDeprecations }: SassConfiguration): PreprocessorOptions | undefined {
  if (!silenceDeprecations) return undefined;
  const sassOptions = { silenceDeprecations: [...silenceDeprecations] };
  return { scss: sassOptions, sass: sassOptions } as PreprocessorOptions;
}

export function stylesPlugin({ project }: ServeContext): Plugin {
  return {
    name: 'fast-serve:styles',
    config: async () => ({
      css: {
        devSourcemap: true,
        modules: { localsConvention: 'camelCase', generateScopedName: '[local]_[hash:base64:8]' },
        preprocessorOptions: sassPreprocessorOptions(await project.sassConfiguration().catch((): SassConfiguration => ({}))),
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
