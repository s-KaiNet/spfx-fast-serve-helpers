import webpack from 'webpack';
import { EntryDescription, NgrokServeOptions } from '../common/types';

export class NgrokServePlugin {
  constructor(private options: NgrokServeOptions) { }

  apply(compiler: webpack.Compiler) {
    compiler.options.devServer.public = this.options.host;
    compiler.options.output.publicPath = `https://${this.options.host}/dist/`;

    const clearCacheScript = require.resolve('./common/ClearCache');
    const entries = compiler.options.entry as Record<string, EntryDescription>; // TODO entry is now object
    for (const key in entries) {
      const entry = entries[key];
      entries[key].import = [clearCacheScript, entry.import as string];
    }

    compiler.options.plugins.push(new webpack.DefinePlugin({
      '__NGROK_HOST__': JSON.stringify(this.options.host)
    }));
  }
}
