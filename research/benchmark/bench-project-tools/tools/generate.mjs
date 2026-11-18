#!/usr/bin/env node
// Generates a synthetic but realistic SPFx component tree under src/gen.
//
//   node tools/generate.mjs [--modules 1000] [--barrels on|off] [--seed 42]
//
// --modules : number of generated TS/TSX modules (components + utils + barrels + types). SCSS files are extra.
// --barrels : "on" (default) = components import utils/shared widgets through barrel index.ts files;
//             "off" = the same imports, but straight from the module files.
// Writes src/gen/** and bench-targets.json (files and DOM markers used by the edit-latency benchmark).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((a) => a.split(/[\s=]+/)));
const N = Number(args.modules || 1000);
const BARRELS = (args.barrels || 'on') !== 'off';
let seed = Number(args.seed || 42);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const genDir = path.join(root, 'src/gen');
fs.rmSync(genDir, { recursive: true, force: true });
const files = new Map();
const write = (rel, text) => files.set(rel, text);

// ---- budget --------------------------------------------------------------------------------------
const nBarrels = 3; // utils/index.ts, components/shared/index.ts, gen/index.ts
const nTypes = 1;   // types.ts
const nUtils = Math.max(8, Math.round(N * 0.12));
const nShared = Math.max(6, Math.round(N * 0.03)); // small leaf widgets exported through the shared barrel
const nTree = N - nBarrels - nTypes - nUtils - nShared;
const depth = Math.max(5, Math.min(11, Math.round(Math.log2(N)) - 1));

// ---- types ---------------------------------------------------------------------------------------
write('types.ts', `export interface INodeProps {
  label: string;
  level: number;
  seed: number;
}

export interface IItem {
  id: number;
  title: string;
  score: number;
  tags: string[];
}

export type Tone = 'neutral' | 'info' | 'warn' | 'error';
`);

// ---- utils: a chain/graph of small modules -------------------------------------------------------
const utilNames = [];
for (let i = 0; i < nUtils; i++) {
  const name = `util${i}`;
  utilNames.push(name);
  const deps = i > 2 ? [utilNames[Math.floor(rnd() * i)], utilNames[Math.floor(rnd() * i)]].filter((v, k, a) => a.indexOf(v) === k) : [];
  const kind = i % 4;
  const body = [
    kind === 0 ? `import { IItem, Tone } from '../types';` : `import { IItem } from '../types';`,
    ...deps.map((d, k) => `import { ${d}${k === 0 ? 'Format' : 'Score'} } from './${d}';`),
    ``,
    `const FACTOR_${i}: number = ${(rnd() * 10 + 1).toFixed(3)};`,
    ``,
    `export function ${name}Format(value: number, suffix?: string): string {`,
    `  const rounded: number = Math.round(value * FACTOR_${i}) / 100;`,
    deps.length ? `  const prefix: string = ${deps[0]}Format(rounded).slice(0, 2);` : `  const prefix: string = '${name.slice(0, 2)}';`,
    `  return prefix + '-' + rounded.toFixed(2) + (suffix ? ' ' + suffix : '');`,
    `}`,
    ``,
    `export function ${name}Score(items: IItem[]): number {`,
    `  let total: number = 0;`,
    `  for (let i = 0; i < items.length; i++) {`,
    `    total += items[i].score * FACTOR_${i}${deps.length > 1 ? ` + ${deps[1]}Score(items.slice(0, 1))` : ''};`,
    `  }`,
    `  return items.length ? total / items.length : 0;`,
    `}`,
    ``,
    kind === 0 ? `export function ${name}Tone(score: number): Tone {\n  if (score > 80) { return 'error'; }\n  if (score > 50) { return 'warn'; }\n  return score > 20 ? 'info' : 'neutral';\n}` :
    kind === 1 ? `export function ${name}Items(count: number, seed: number): IItem[] {\n  const result: IItem[] = [];\n  for (let i = 0; i < count; i++) {\n    result.push({ id: seed * 100 + i, title: 'Item ' + (seed + i), score: (seed * 7 + i * 13) % 100, tags: ['t' + (i % 3)] });\n  }\n  return result;\n}` :
    kind === 2 ? `export const ${name}Labels: { [key: string]: string } = {\n  neutral: 'Neutral ${i}',\n  info: 'Info ${i}',\n  warn: 'Warning ${i}',\n  error: 'Error ${i}'\n};` :
                 `export class ${name[0].toUpperCase() + name.slice(1)}Cache {\n  private _map: { [key: string]: number } = {};\n  public get(key: string): number | undefined { return this._map[key]; }\n  public set(key: string, value: number): void { this._map[key] = value * FACTOR_${i}; }\n}`,
    ``
  ];
  write(`utils/${name}.ts`, body.join('\n'));
}
write('utils/index.ts', utilNames.map((u) => `export * from './${u}';`).join('\n') + '\n');
const itemUtils = utilNames.filter((_, i) => i % 4 === 1);
const toneUtils = utilNames.filter((_, i) => i % 4 === 0);

// ---- styles ----------------------------------------------------------------------------------------
write('styles/_tokens.scss', `$gap: 4px;
$radius: 2px;
$accent: "[theme:themePrimary, default: #0078d4]";
$text: "[theme:bodyText, default: #323130]";
$subtle: "[theme:bodySubtext, default: #605e5c]";
$border: "[theme:neutralLight, default: #edebe9]";

@mixin card {
  border: 1px solid $border;
  border-radius: $radius;
  padding: $gap * 2;
}
`);
let scssCount = 0;
const scss = (rel, cls) => {
  scssCount++;
  write(rel, `@use '${path.posix.relative(path.posix.dirname('gen/' + rel), 'gen/styles/tokens')}' as *;

.${cls} {
  @include card;
  color: $text;
  margin: $gap 0 $gap ${scssCount % 3 * 4}px;

  .title {
    color: $accent;
    font-weight: 600;
  }

  .meta {
    color: $subtle;
    font-size: 12px;
  }

  &:hover {
    border-color: "[theme:themeTertiary, default: #71afe5]";
  }
}

.marker {
  outline: 1px solid rgb(0, 0, ${scssCount % 200});
}
`);
};

// ---- shared widgets (behind a barrel) --------------------------------------------------------------
const sharedNames = [];
for (let i = 0; i < nShared; i++) {
  const name = `Shared${i}`;
  sharedNames.push(name);
  const useFluent = i % 3 === 0;
  write(`components/shared/${name}.tsx`, `import * as React from 'react';
${useFluent ? `import { Text } from '@fluentui/react/lib/Text';\n` : ''}import { Tone } from '../../types';

export interface I${name}Props {
  text: string;
  tone?: Tone;
}

export function ${name}(props: I${name}Props): React.ReactElement {
  const tone: Tone = props.tone || 'neutral';
  return ${useFluent ? `<Text variant="small" data-tone={tone}>{props.text}</Text>` : `<span className={'shared-${i} tone-' + tone}>{props.text}</span>`};
}
`);
}
write('components/shared/index.ts', sharedNames.map((s) => `export * from './${s}';`).join('\n') + '\n');

// ---- the tree ------------------------------------------------------------------------------------
// Level sizes grow geometrically from 1 (root) so that the sum is nTree and the depth is `depth`.
let ratio = 1.5;
const sizesFor = (r) => Array.from({ length: depth }, (_, l) => Math.max(1, Math.round(Math.pow(r, l))));
for (let lo = 1.01, hi = 10, k = 0; k < 60; k++) {
  ratio = (lo + hi) / 2;
  const sum = sizesFor(ratio).reduce((a, b) => a + b, 0);
  if (sum > nTree) hi = ratio; else lo = ratio;
}
const sizes = sizesFor(ratio);
sizes[depth - 1] += nTree - sizes.reduce((a, b) => a + b, 0);
const levels = [];
let nodeId = 0;
for (let l = 0; l < depth; l++) {
  levels.push(Array.from({ length: sizes[l] }, () => ({ id: nodeId++, level: l, children: [] })));
  if (l > 0) levels[l].forEach((node, i) => { const parent = levels[l - 1][i % levels[l - 1].length]; parent.children.push(node); node.parent = parent; });
}
const allNodes = levels.flat();
const nodeName = (n) => (n.level === 0 ? 'TreeRoot' : `Node${n.id}`);
const nodeDir = (n) => (n.level === 0 ? 'components' : `components/l${n.level}`);

const rel = (from, to) => { const r = path.posix.relative(from, to); return r.startsWith('.') ? r : './' + r; };
const utilImport = (dir, names) => {
  if (!names.length) return '';
  const r = rel(dir, 'utils');
  if (BARRELS) return `import { ${names.join(', ')} } from '${r}';\n`;
  return names.map((n) => `import { ${n} } from '${r}/${n.replace(/(Format|Score|Items|Tone)$/, '')}';\n`).join('');
};
const sharedImport = (dir, name) => {
  const r = rel(dir, 'components/shared');
  return BARRELS ? `import { ${name} } from '${r}';\n` : `import { ${name} } from '${r}/${name}';\n`;
};

for (const n of allNodes) {
  const name = nodeName(n);
  const dir = nodeDir(n);
  const isLeaf = n.children.length === 0;
  const hasScss = n.id % 7 === 0;
  const fluent = n.id % 5 === 0 ? pick(['Stack', 'Icon', 'Toggle', 'Label']) : undefined;
  const shared = n.id % 3 === 0 ? sharedNames[n.id % sharedNames.length] : undefined;
  const fmt = utilNames[n.id % utilNames.length] + 'Format';
  const items = itemUtils[n.id % itemUtils.length] + 'Items';
  const tone = toneUtils[n.id % toneUtils.length] + 'Tone';
  const utilList = isLeaf ? [fmt] : shared ? [fmt, items, tone] : [fmt, items];
  if (hasScss) scss(`${dir}/${name}.module.scss`, `node${n.id}`);
  const childImports = n.children.map((c) => `import { ${nodeName(c)} } from '${rel(dir, nodeDir(c) + '/' + nodeName(c))}';`).join('\n');
  const fluentImport = fluent ? `import { ${fluent} } from '@fluentui/react/lib/${fluent}';\n` : '';
  const cls = hasScss ? `styles.node${n.id}` : `'node node-l${n.level}'`;
  const fluentJsx = fluent === 'Stack' ? `<Stack horizontal tokens={{ childrenGap: 4 }}><span>{'stack ${n.id}'}</span></Stack>`
    : fluent === 'Icon' ? `<Icon iconName="Info" />`
    : fluent === 'Toggle' ? `<Toggle checked={open} onChange={() => setOpen(!open)} />`
    : fluent === 'Label' ? `<Label>{'label ${n.id}'}</Label>` : '';
  const code = `import * as React from 'react';
${fluentImport}${hasScss ? `import styles from './${name}.module.scss';\n` : ''}${utilImport(dir, utilList)}${shared ? sharedImport(dir, shared) : ''}import { INodeProps${isLeaf ? '' : ', IItem'} } from '${rel(dir, 'types')}';
${childImports}

export function ${name}(props: INodeProps): React.ReactElement {
  const [open, setOpen] = React.useState<boolean>(${n.level < 3 ? 'true' : 'false'});
  const label: string = React.useMemo(() => ${fmt}(props.seed + ${n.id}, props.label), [props.seed, props.label]);
${isLeaf ? '' : `  const items: IItem[] = React.useMemo(() => ${items}(2, props.seed + ${n.id}), [props.seed]);\n`}  return (
    <div className={${cls}} data-node="${n.id}" data-level={props.level}>
      <div className=${hasScss ? '{styles.title}' : '"title"'} onClick={() => setOpen(!open)}>
        <span className="node-label">{/*EDIT*/'v0'} ${name}</span> {label}${isLeaf && hasScss ? ` <span className={styles.marker} data-marker="${n.id}">m</span>` : ''}
      </div>
${fluentJsx ? `      ${fluentJsx}\n` : ''}${shared ? `      <${shared} text={label} ${isLeaf ? '' : `tone={${tone}(items[0].score)} `}/>\n` : ''}${isLeaf ? '' : `      <ul className=${hasScss ? '{styles.meta}' : '"meta"'}>{items.map((it: IItem) => <li key={it.id}>{it.title}</li>)}</ul>
      <div className="children">
${n.children.map((c) => `        <${nodeName(c)} label={props.label} level={props.level + 1} seed={props.seed + ${c.id}} />`).join('\n')}
      </div>
`}    </div>
  );
}
`;
  write(`${dir}/${name}.tsx`, code);
}
write('index.ts', `export { TreeRoot } from './components/TreeRoot';\nexport * from './types';\n`);

// ---- edit targets --------------------------------------------------------------------------------
const leaves = allNodes.filter((n) => n.children.length === 0);
const leafScss = leaves.filter((n) => n.id % 7 === 0);
const mid = levels[Math.floor(depth / 2)][0];
const leaf = leaves[Math.floor(leaves.length / 2)];
const scssLeaf = leafScss[Math.floor(leafScss.length / 2)];
const targets = {
  modules: N, barrels: BARRELS, depth, levelSizes: sizes,
  counts: { tree: nTree, utils: nUtils, shared: nShared, barrels: nBarrels, types: nTypes, scss: scssCount + 1 },
  leaf: { file: `src/gen/${nodeDir(leaf)}/${nodeName(leaf)}.tsx`, node: leaf.id },
  mid: { file: `src/gen/${nodeDir(mid)}/${nodeName(mid)}.tsx`, node: mid.id, descendants: (function c(n) { return n.children.reduce((a, k) => a + 1 + c(k), 0); })(mid) },
  scss: scssLeaf && { file: `src/gen/${nodeDir(scssLeaf)}/${nodeName(scssLeaf)}.module.scss`, node: scssLeaf.id }
};

for (const [rel, text] of files) {
  const full = path.join(genDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}
fs.writeFileSync(path.join(root, 'bench-targets.json'), JSON.stringify(targets, null, 2) + '\n');
const tsCount = [...files.keys()].filter((f) => /\.tsx?$/.test(f)).length;
console.log(`generated ${tsCount} TS/TSX modules + ${scssCount + 1} SCSS files in src/gen (depth ${depth}, levels ${sizes.join('/')}, barrels ${BARRELS ? 'on' : 'off'})`);
