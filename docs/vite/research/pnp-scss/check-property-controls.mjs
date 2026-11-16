// What SPFx 1.24's module rule does with @pnp/spfx-property-controls' prehashed X.module.css (via the same sp-css-loader call).
import path from 'node:path';
import { createCompilerForTest } from './spfx-lib-css.mjs';
const file = process.argv[2];
const compile = createCompilerForTest('/home/sergei/Projects/spfx-bench');
console.log((await compile(file)).slice(-700));
