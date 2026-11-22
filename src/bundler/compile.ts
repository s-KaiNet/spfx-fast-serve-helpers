import { rspack, type Stats } from '@rspack/core';
import type { BuildContext } from './featureApi/index.js';
import { createRspackConfig, type RspackConfigOptions } from './config.js';

export interface CompileResult {
  durationMs: number;
  errors: string[];
  warnings: string[];
  assets: string[];
  fileDependencies: string[];
}

export async function compileOnce(context: BuildContext, options: RspackConfigOptions = {}): Promise<CompileResult> {
  const compiler = rspack(await createRspackConfig(context, options));
  try {
    const stats = await new Promise<Stats>((resolve, reject) => {
      compiler.run((error, result) => {
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error('Rspack finished without stats'));
      });
    });
    const json = stats.toJson({ all: false, errors: true, warnings: true, assets: true, timings: true });
    return {
      durationMs: json.time ?? 0,
      errors: (json.errors ?? []).map((error) => error.message),
      warnings: (json.warnings ?? []).map((warning) => warning.message),
      assets: (json.assets ?? []).map((asset) => asset.name),
      fileDependencies: [...stats.compilation.fileDependencies],
    };
  } finally {
    await new Promise<void>((resolve) => {
      compiler.close(() => {
        resolve();
      });
    });
  }
}
