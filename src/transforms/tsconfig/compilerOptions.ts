import type { JsonObject } from '../../utils/guards.js';

const BOOLEAN_OPTIONS = ['experimentalDecorators', 'emitDecoratorMetadata', 'useDefineForClassFields', 'strict', 'strictNullChecks'] as const;

type BooleanOption = (typeof BOOLEAN_OPTIONS)[number];

export type TransformCompilerOptions = Partial<Record<BooleanOption, boolean>> & { target?: string };

export function transformCompilerOptions(compilerOptions: JsonObject): TransformCompilerOptions {
  const result: TransformCompilerOptions = {};
  for (const option of BOOLEAN_OPTIONS) {
    const value = compilerOptions[option];
    if (typeof value === 'boolean') result[option] = value;
  }
  if (typeof compilerOptions.target === 'string') result.target = compilerOptions.target;
  return result;
}
