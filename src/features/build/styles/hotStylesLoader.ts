const LOAD_STYLES_CALL = '__LOAD_THEMED_STYLES__.loadStyles(';
const HOT_LOADER_NAME = '__FAST_SERVE_LOAD_HOT_STYLES__';

interface LoaderContext {
  getOptions(): { runtime: string };
}

function hotStylesLoader(this: LoaderContext, source: string): string {
  return withHotStyles(source, this.getOptions().runtime);
}

export default hotStylesLoader;

export function withHotStyles(source: string, runtime: string): string {
  if (!source.includes(LOAD_STYLES_CALL)) return source;
  const importLine = `import { loadHotStyles as ${HOT_LOADER_NAME} } from ${JSON.stringify(runtime)};\n`;
  return importLine + source.replace(LOAD_STYLES_CALL, `${HOT_LOADER_NAME}(import.meta.webpackHot, __LOAD_THEMED_STYLES__, `);
}
