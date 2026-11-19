import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { ConfigExternal } from '../project/index.js';
import { errorMessage } from '../utils/errors.js';

const PLUGIN_NAME = 'fast-serve:local-external-files';

export interface LocalExternalFile {
  name: string;
  file: string;
  assetName: string;
}

export function localExternalFiles(externals: Iterable<ConfigExternal>): LocalExternalFile[] {
  return [...externals].flatMap(({ name, source }) =>
    source.type === 'file' ? [{ name, file: source.file, assetName: localExternalAssetName(name, source.file) }] : [],
  );
}

export function localExternalAssetName(name: string, file: string): string {
  return `${name}${path.extname(file)}`;
}

export class LocalExternalFilesPlugin implements RspackPluginInstance {
  readonly #files: readonly LocalExternalFile[];
  readonly #onChanged: () => void;
  #changed = false;

  constructor(files: readonly LocalExternalFile[], onChanged: () => void) {
    this.#files = files;
    this.#onChanged = onChanged;
  }

  apply(compiler: Compiler): void {
    if (this.#files.length === 0) return;
    const { RawSource } = compiler.webpack.sources;
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        { name: PLUGIN_NAME, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        async () => {
          const contents = await Promise.allSettled(this.#files.map(({ file }) => readFile(file)));
          for (const [index, { name, file, assetName }] of this.#files.entries()) {
            compilation.fileDependencies.add(file);
            const content = contents[index];
            if (content?.status === 'fulfilled') compilation.emitAsset(assetName, new RawSource(content.value));
            else compilation.errors.push(new compiler.webpack.WebpackError(`config/config.json externals "${name}": ${errorMessage(content?.reason)}`));
          }
        },
      );
    });
    compiler.hooks.watchRun.tap(PLUGIN_NAME, ({ modifiedFiles, removedFiles }) => {
      const touched = new Set([...(modifiedFiles ?? []), ...(removedFiles ?? [])]);
      if (this.#files.some(({ file }) => touched.has(file))) this.#changed = true;
    });
    compiler.hooks.done.tap(PLUGIN_NAME, () => {
      if (!this.#changed) return;
      this.#changed = false;
      this.#onChanged();
    });
  }
}
