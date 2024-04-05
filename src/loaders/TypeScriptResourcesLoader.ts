import { LoaderContext } from 'webpack';
import * as path from 'path';
import { createKeyFromPath } from '../common/helpers';
import { ResourceData } from '../common/types';

export default function loader(this: LoaderContext<any>, source: string, data: { file: string }) {
  if (!source || !data) {
    return source;
  }

  const options: Record<string, ResourceData> = this.getOptions(this);
  const filePath = path.relative(this._compiler.options.context, data.file);
  const key = createKeyFromPath(filePath);
  if (options[key]) {
    this.emitFile(options[key].fileName, source, null);
  }

  this.callback(null, source, data as any);

  return undefined;
}
