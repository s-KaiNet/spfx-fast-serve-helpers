const variant = process.argv[2];
const base = `/tmp/deco-exp/run/${variant}`;
const cases = [
  ['decorators+fields', 'cases.mjs', (m) => m.runAll()],
  ['metadata (import type)', 'meta/consumerTyped.mjs', async (m) => { await import('reflect-metadata'); return m.readMetadata(); }],
  ['metadata', 'meta/consumer.mjs', async (m) => { await import('reflect-metadata'); return m.readMetadata(); }],
  ['enum direct', 'enums/useDirect.mjs', (m) => m.direct],
  ['enum reexport', 'enums/useReexport.mjs', (m) => m.viaReexport],
  ['enum local', 'enums/local.mjs', (m) => m.local],
  ['enum ambient .d.ts', 'enums/useAmbient.mjs', (m) => m.ambient],
  ['enum module .d.ts', 'enums/useDts.mjs', (m) => m.fromDts],
];
for (const [label, file, read] of cases) {
  try {
    const m = await import(`${base}/${file}`);
    console.log(`${variant} | ${label} | OK ${JSON.stringify(await read(m))}`);
  } catch (e) {
    console.log(`${variant} | ${label} | ERROR ${e.constructor.name}: ${e.message.split('\n')[0]}`);
  }
}
