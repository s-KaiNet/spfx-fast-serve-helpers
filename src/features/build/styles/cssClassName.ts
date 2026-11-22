import { createHmac } from 'node:crypto';
import path from 'node:path';
import type { SassConfiguration } from '../../../project/index.js';
import { isInside } from '../../../shared/paths.js';

export type CssClassNameGenerator = (className: string, cssFile: string, css: string | Buffer) => string;

const SASS_SOURCE = /\.s[ac]ss$/i;
const HEFT_BUNDLED_CSS_FOLDER = 'lib';

export interface HeftCssFile {
  file: string;
  css: string;
}

export type HeftCssFileMapper = (cssFile: string, css: string) => HeftCssFile;

export function createCssClassNameGenerator(heftCssFile: HeftCssFileMapper = (file, css) => ({ file, css })): CssClassNameGenerator {
  return (className, cssFile, css) => {
    const hashed = heftCssFile(cssFile, css.toString());
    return `${className}_${createHmac('sha1', hashed.file).update(hashed.css).digest('hex').slice(0, 8)}`;
  };
}

export function heftCssFileMapper(root: string, configuration: SassConfiguration): HeftCssFileMapper {
  const sourceFolder = path.resolve(root, configuration.srcFolder ?? 'src');
  const outputFolder = bundledCssFolder(configuration.cssOutputFolders);
  if (outputFolder === undefined) return (file, css) => ({ file, css });
  const cssFolder = path.resolve(root, outputFolder);
  return (file, css) => {
    if (!SASS_SOURCE.test(file) || !isInside(sourceFolder, file)) return { file, css };
    const relative = path.relative(sourceFolder, file);
    const cssRelative = configuration.doNotTrimOriginalFileExtension ? `${relative}.css` : relative.replace(SASS_SOURCE, '.css');
    const cssFile = path.join(cssFolder, cssRelative);
    return { file: cssFile, css: configuration.sourceMap ? cssAfterHeftSourceMapLoader(css) : css };
  };
}

function cssAfterHeftSourceMapLoader(css: string): string {
  return `${css}\n`;
}

function bundledCssFolder(folders: SassConfiguration['cssOutputFolders']): string | undefined {
  const names = (folders ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.folder));
  return names.find((name) => path.normalize(name).replace(/[\\/]+$/, '') === HEFT_BUNDLED_CSS_FOLDER) ?? names[0];
}
