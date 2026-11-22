import path from 'node:path';

interface LoaderContext {
  resourcePath: string;
}

const MODULE_PATH_VARIABLES = /\b__(?:dirname|filename)\b/;

function sourceDirLoader(this: LoaderContext, source: string): string {
  return withModulePaths(source, this.resourcePath);
}

export default sourceDirLoader;

export function withModulePaths(source: string, file: string): string {
  if (!MODULE_PATH_VARIABLES.test(source)) return source;
  const declarations = `var __filename = ${JSON.stringify(file)}; var __dirname = ${JSON.stringify(path.dirname(file))};`;
  return source.startsWith('#!') ? source.replace(/^(#![^\n]*\n?)/, `$1${declarations}`) : `${declarations}${source}`;
}
