import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { constEnumGuardPlugin } from './constEnums/index.js';
import { definesPlugin } from './defines.js';
import { requireImportsPlugin } from './requireImports.js';
import { tsconfigTransformPlugin } from './tsconfig/index.js';
import { typeOnlyNamesGuardPlugin } from './typeOnlyNames/index.js';

export function transformPlugins(context: ServeContext): Plugin[] {
  return [definesPlugin(), tsconfigTransformPlugin(context), requireImportsPlugin(context), typeOnlyNamesGuardPlugin(context), constEnumGuardPlugin(context)];
}
