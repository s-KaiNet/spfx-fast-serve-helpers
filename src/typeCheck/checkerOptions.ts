import path from 'node:path';
import type { TsCheckerRspackPluginOptions } from 'ts-checker-rspack-plugin/lib/plugin-options.js';
import { TSCONFIG_FILE } from './projectTypeScript.js';

export const TS_BUILD_INFO_FILE = path.join('temp', 'fast-serve', 'typecheck.tsbuildinfo');

const SILENT_LOGGER = { log: () => undefined, error: () => undefined };

export function checkerOptions(root: string, typescriptPath: string): TsCheckerRspackPluginOptions {
  return {
    async: true,
    devServer: false,
    formatter: 'basic',
    logger: SILENT_LOGGER,
    typescript: {
      configFile: path.join(root, TSCONFIG_FILE),
      context: root,
      typescriptPath,
      build: false,
      mode: 'write-tsbuildinfo',
      configOverwrite: { compilerOptions: { incremental: true, tsBuildInfoFile: path.join(root, TS_BUILD_INFO_FILE) } },
      diagnosticOptions: { syntactic: true, semantic: true },
    },
  };
}
