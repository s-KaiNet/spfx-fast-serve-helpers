import { transformSync } from '/home/sergei/Projects/spfx-rea/node_modules/rolldown/dist/utils-index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const variants = {
  empty: {},
  inuav: { importsNotUsedAsValues: 'remove' },
  deco: { experimentalDecorators: true },
  decoMeta: { experimentalDecorators: true, emitDecoratorMetadata: true },
  target: { target: 'es5' },
  jsx: { jsx: 'react' },
  inuavVerbatimFalse: { importsNotUsedAsValues: 'remove', verbatimModuleSyntax: false },
  inuavPreserveValueFalse: { importsNotUsedAsValues: 'remove', preserveValueImports: false },
  esModuleInterop: { esModuleInterop: true, importHelpers: true, module: 'esnext' },
};
for (const [name, co] of Object.entries(variants)) {
  writeFileSync('/tmp/deco-exp/elide/tsconfig.json', JSON.stringify({ compilerOptions: co }));
  const r = transformSync('/tmp/deco-exp/elide/a.ts', readFileSync('/tmp/deco-exp/elide/a.ts', 'utf8'), { tsconfig: '/tmp/deco-exp/elide/tsconfig.json' });
  console.log(name.padEnd(16), r.code.includes('IFoo') ? 'KEEPS type import' : 'elides', r.warnings.map((w) => w.field0?.message ?? w).join('|'));
}
