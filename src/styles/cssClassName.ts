import { createHmac } from 'node:crypto';

export type CssClassNameGenerator = (className: string, cssFile: string, css: string | Buffer) => string;

export function createCssClassNameGenerator(): CssClassNameGenerator {
  return (className, cssFile, css) => `${className}_${createHmac('sha1', cssFile).update(css).digest('hex').slice(0, 8)}`;
}
