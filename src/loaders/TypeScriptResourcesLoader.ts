import webpack from 'webpack';
import * as path from 'path';
import { getOptions } from 'loader-utils';
import { createKeyFromPath } from '../webpack/helpers';
import { ResourceData } from '../common/types';

export default function loader(this: webpack.loader.LoaderContext, source: string, data: { file: string }) {
  if (!source || !data) {
    return source;
  }

  const options: Record<string, ResourceData> = getOptions(this) as any;
  const filePath = path.relative(this._compiler.options.context, data.file);
  const key = createKeyFromPath(filePath);
  if (options[key]) {
    this.emitFile(options[key].fileName, source, null);
  }

  this.callback(null, source, data as any);
  
  return undefined;
}
