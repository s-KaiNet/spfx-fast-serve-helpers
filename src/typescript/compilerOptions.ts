import type { JsonObject } from '../shared/guards.js';

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

const CLASS_OPTION_NAMES: Record<keyof ClassTransformOptions, string> = {
  legacyDecorators: 'experimentalDecorators',
  decoratorMetadata: 'emitDecoratorMetadata',
  useDefineForClassFields: 'useDefineForClassFields',
};

export function classTransformDifference(project: ClassTransformOptions, library: ClassTransformOptions): string | undefined {
  const differences = (Object.keys(CLASS_OPTION_NAMES) as (keyof ClassTransformOptions)[])
    .filter((key) => project[key] !== library[key])
    .map((key) => `${CLASS_OPTION_NAMES[key]}: ${String(library[key])} in the library, ${String(project[key])} in the project`);
  return differences.length === 0 ? undefined : differences.join(', ');
}
