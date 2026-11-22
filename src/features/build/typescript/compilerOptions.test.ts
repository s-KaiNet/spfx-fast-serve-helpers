import { describe, expect, it } from 'vitest';
import { declaresOnlyType } from './typeOnlyNames.js';
import { classTransformOptions } from './compilerOptions.js';

describe('classTransformOptions', () => {
  it('follows tsc: legacy decorators and metadata only with experimentalDecorators, class fields defined from ES2022', () => {
    expect(classTransformOptions({ experimentalDecorators: true, emitDecoratorMetadata: true, target: 'es5' })).toEqual({
      legacyDecorators: true,
      decoratorMetadata: true,
      useDefineForClassFields: false,
    });
    expect(classTransformOptions({ emitDecoratorMetadata: true, target: 'ESNext' })).toEqual({ legacyDecorators: false, decoratorMetadata: false, useDefineForClassFields: true });
    expect(classTransformOptions({ target: 'es2022', useDefineForClassFields: false }).useDefineForClassFields).toBe(false);
    expect(classTransformOptions({ useDefineForClassFields: true }).useDefineForClassFields).toBe(true);
    expect(classTransformOptions({})).toEqual({ legacyDecorators: false, decoratorMetadata: false, useDefineForClassFields: false });
  });
});

describe('declaresOnlyType', () => {
  it('is true for interfaces and type aliases without a value of the same name', () => {
    expect(declaresOnlyType('export interface IProps {\n  title: string;\n}\n', 'IProps')).toBe(true);
    expect(declaresOnlyType('export type Name = string;\n', 'Name')).toBe(true);
    expect(declaresOnlyType('export interface Level {}\nexport const Level = {};\n', 'Level')).toBe(false);
    expect(declaresOnlyType('export const enum Level { A }\n', 'Level')).toBe(false);
    expect(declaresOnlyType('export interface ILevelProps {}\n', 'ILevel')).toBe(false);
  });
});
