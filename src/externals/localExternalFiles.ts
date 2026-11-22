import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Compiler, RspackPluginInstance } from '@rspack/core';
import { decodedRequestPath, DIST_PATH, isReadRequest, send, type ServerMiddleware } from '../bundler/featureApi/index.js';
import type { ConfigExternal } from '../project/index.js';
import { errorMessage } from '../shared/errors.js';

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

const HEFT_CONTENT_HASH = /^_[0-9a-f]{32}$/;

export function heftLocalExternalFile(files: readonly LocalExternalFile[], urlPath: string): LocalExternalFile | undefined {
  if (!urlPath.startsWith(DIST_PATH)) return undefined;
  const requested = urlPath.slice(DIST_PATH.length);
  return files.find(({ name, file }) => {
    const extension = path.extname(file);
    return requested.startsWith(name) && requested.endsWith(extension) && HEFT_CONTENT_HASH.test(requested.slice(name.length, requested.length - extension.length));
  });
}

export function heftLocalExternalsMiddleware(files: readonly LocalExternalFile[]): ServerMiddleware {
  return {
    name: 'fast-serve:heft-local-externals',
    middleware: async (req, res, next) => {
      const urlPath = isReadRequest(req) ? decodedRequestPath(req) : undefined;
      const external = urlPath === undefined ? undefined : heftLocalExternalFile(files, urlPath);
      if (external === undefined) {
        next();
        return;
      }
      try {
        send(req, res, 'application/javascript; charset=utf-8', await readFile(external.file));
      } catch (error) {
        next(error);
      }
    },
  };
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
