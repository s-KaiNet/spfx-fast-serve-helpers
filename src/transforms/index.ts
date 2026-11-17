import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { definesPlugin } from './defines.js';
import { requireImportsPlugin } from './requireImports.js';
import { tsconfigTransformPlugin } from './tsconfig/index.js';
import { typeReexportGuardPlugin } from './typeReexports/index.js';

export function transformPlugins(context: ServeContext): Plugin[] {
  return [definesPlugin(), tsconfigTransformPlugin(context), requireImportsPlugin(context), typeReexportGuardPlugin(context)];
}
