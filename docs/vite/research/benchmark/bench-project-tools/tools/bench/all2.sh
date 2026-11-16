#!/bin/sh
cd "$(dirname "$0")/../.."
R=${RUNS:-3}
node tools/generate.mjs --modules 1000
node tools/bench/run.mjs heft $R
node tools/bench/run.mjs vite-loads $R 1000-extra
node tools/bench/run.mjs vite-warmup $R
node tools/generate.mjs --modules 1000 --barrels off
node tools/bench/run.mjs vite-loads $R
for n in 250 2000; do
  node tools/generate.mjs --modules $n
  node tools/bench/run.mjs vite $R
  node tools/bench/run.mjs heft $R
done
node tools/generate.mjs --modules 1000
echo ALL-DONE
