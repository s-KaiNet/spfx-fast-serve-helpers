import { describe, expect, it } from 'vitest';
import { exportedConstEnums, globalConstEnums, referencedGlobals } from './declarations.js';


describe('globalConstEnums', () => {
  it('reads const enums of global declaration files and of declare global blocks only', () => {
    expect(globalConstEnums('declare const enum GlobalLevel { Low = 10 }\n/* const enum Commented {} */\nconst enum Plain { A }')).toEqual(['GlobalLevel', 'Plain']);
    expect(globalConstEnums("import type { X } from './x';\ndeclare global {\n  const enum Augmented { A = 1 }\n  interface Window { x: X }\n}\ndeclare const enum ModuleScoped { A }")).toEqual(['Augmented']);
    expect(globalConstEnums('export declare const enum DtsEnum { X = 7 }')).toEqual([]);
  });
});

describe('exportedConstEnums', () => {
  it('lists the exported const enums of a declaration module', () => {
    expect(exportedConstEnums('export declare const enum DtsEnum { X = 7 }\nexport const enum Other { A }\nexport interface I {}')).toEqual(['DtsEnum', 'Other']);
  });
});

describe('referencedGlobals', () => {
  it('finds value uses of names the module does not declare or import', () => {
    expect(referencedGlobals('export const a = { high: GlobalLevel.High, b: Other["B"] };', ['GlobalLevel', 'Other', 'Unused'])).toEqual(['GlobalLevel', 'Other']);
    expect(referencedGlobals('import { GlobalLevel } from "./levels";\nexport const a = GlobalLevel.High;', ['GlobalLevel'])).toEqual([]);
    expect(referencedGlobals('var GlobalLevel = {};\nexport const a = GlobalLevel.High;', ['GlobalLevel'])).toEqual([]);
    expect(referencedGlobals('export const a = props.GlobalLevel.High + MyGlobalLevel.x;', ['GlobalLevel'])).toEqual([]);
  });
});
