import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { rspack } from '@rspack/core';
import { createRspackBuild } from '../../../lib/rspack/index.js';
import { createProject } from '../../../lib/project/index.js';
import { SharedHotUpdateGlobalPlugin } from '../../../lib/hmr/index.js';

const [root, variant, ...editFiles] = process.argv.slice(2);
const EDITS_PER_FILE = 4;
const COPIES = Number(process.env.COPIES ?? 1);
const logger = { info: () => undefined, warn: () => undefined, error: console.error };
const context = { root, project: createProject(root, logger), options: { origin: 'https://localhost:4499', locale: 'en-us' }, logger };
const outputPath = path.join('/var/tmp/rspack-impl/r5/variant-out', variant);
const rssMb = () => Math.round(process.memoryUsage().rss / 1048576);

function bundleEntries(entry) {
  const copies = {};
  for (const [name, file] of Object.entries(entry)) for (let copy = 0; copy < COPIES; copy++) copies[copy === 0 ? name : `${name}-copy${copy}`] = file;
  return copies;
}

async function singleConfig() {
  const { config } = await createRspackBuild(context, { outputPath });
  config.entry = bundleEntries(config.entry);
  config.plugins.push(new rspack.HotModuleReplacementPlugin());
  return config;
}

async function multiConfigs() {
  const configs = [];
  const names = Object.keys(bundleEntries(Object.fromEntries(context.project.bundles().map((bundle) => [bundle.name, bundle.name]))));
  for (const name of names) {
    const { config } = await createRspackBuild(context, { outputPath });
    const suffix = name.replaceAll(/[^\w]/g, '_');
    config.name = name;
    config.entry = { [name]: bundleEntries(config.entry)[name] };
    config.output.uniqueName = `${config.output.uniqueName}_${suffix}`;
    config.output.chunkLoadingGlobal = `webpackJsonp_${config.output.uniqueName}`;
    config.plugins = config.plugins.filter((plugin) => !(plugin instanceof SharedHotUpdateGlobalPlugin));
    config.plugins.push(new rspack.HotModuleReplacementPlugin());
    configs.push(config);
  }
  return configs;
}

const compiler = rspack(variant === 'multi' ? await multiConfigs() : await singleConfig());
const started = performance.now();
let resolveDone;
compiler.hooks.done.tap('measure', (stats) => resolveDone?.(stats));
const nextDone = () => new Promise((resolve) => (resolveDone = resolve));
const firstDone = nextDone();
const watching = compiler.watch({ aggregateTimeout: 5 }, () => undefined);
const firstStats = await firstDone;
const startMs = Math.round(performance.now() - started);
const errors = firstStats.toJson({ all: false, errors: true }).errors?.length ?? firstStats.toJson({ all: false, errors: true }).children?.reduce((sum, child) => sum + (child.errors?.length ?? 0), 0);
const rssStart = rssMb();
const rebuilds = [];
for (const file of editFiles) {
  const absolute = path.join(root, file);
  const original = readFileSync(absolute, 'utf8');
  try {
    for (let index = 0; index < EDITS_PER_FILE; index++) {
      await delay(300);
      const done = nextDone();
      const editedAt = performance.now();
      writeFileSync(absolute, `${original}\nconst fastServeEdit = ${index + 1};\n`);
      await done;
      rebuilds.push({ file: path.basename(file), ms: Math.round(performance.now() - editedAt) });
    }
  } finally {
    writeFileSync(absolute, original);
  }
}
await delay(500);
const rssEnd = rssMb();
console.log(JSON.stringify({ variant, copies: COPIES, root: path.basename(root), compilers: variant === 'multi' ? compiler.compilers.length : 1, errors, startMs, rssStart, rssEnd, rebuilds }));
watching.close(() => process.exit(0));
