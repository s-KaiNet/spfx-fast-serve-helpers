import type { JsonObject } from '../utils/guards.js';

export interface ClassTransformOptions {
  legacyDecorators: boolean;
  decoratorMetadata: boolean;
  useDefineForClassFields: boolean;
}

const DEFINE_CLASS_FIELDS_TARGETS = /^es(?:next|20(?:2[2-9]|[3-9]\d))$/i;

export function classTransformOptions(compilerOptions: JsonObject): ClassTransformOptions {
  const legacyDecorators = compilerOptions.experimentalDecorators === true;
  const target = typeof compilerOptions.target === 'string' ? compilerOptions.target : 'es5';
  const useDefineForClassFields = typeof compilerOptions.useDefineForClassFields === 'boolean' ? compilerOptions.useDefineForClassFields : DEFINE_CLASS_FIELDS_TARGETS.test(target);
  return {
    legacyDecorators,
    decoratorMetadata: legacyDecorators && compilerOptions.emitDecoratorMetadata === true,
    useDefineForClassFields,
  };
}
