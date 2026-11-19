import path from 'node:path';
import { rspackVersion, type Configuration } from '@rspack/core';
import { packageVersion } from '../packageInfo.js';
import { configText, filesText, fingerprint } from './fingerprint.js';

export { configText, filesText, fingerprint } from './fingerprint.js';

export const CACHE_FOLDER = path.join('temp', 'fast-serve', 'cache');

const LOCK_FILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-shrinkwrap.json'];

export interface PersistentCacheInputs {
  root: string;
  config: Configuration;
  files: readonly string[];
}

export function withPersistentCache({ root, config, files }: PersistentCacheInputs): Configuration {
  const output = { ...config.output, hashSalt: undefined };
  const lockFiles = LOCK_FILES.map((file) => path.join(root, file));
  const version = fingerprint(packageVersion, rspackVersion, configText({ ...config, output, cache: undefined }), filesText([...files, ...lockFiles]));
  return {
    ...config,
    cache: {
      type: 'persistent',
      version,
      storage: { type: 'filesystem', directory: path.join(root, CACHE_FOLDER) },
    },
  };
}
