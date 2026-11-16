import { createHmac } from 'node:crypto';

export type CssClassNameGenerator = (className: string, cssFile: string, css: string | Buffer) => string;

export function createCssClassNameGenerator(): CssClassNameGenerator {
  const hashByFile = new Map<string, string>();
  return (className, cssFile, css) => {
    let hash = hashByFile.get(cssFile);
    if (!hash) {
      hash = createHmac('sha1', cssFile).update(css).digest('hex').slice(0, 8);
      hashByFile.set(cssFile, hash);
    }
    return `${className}_${hash}`;
  };
}
