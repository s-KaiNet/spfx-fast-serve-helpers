import { setTimeout as delay } from 'node:timers/promises';
import type { DevEnvironment } from 'vite';

const OPTIMIZER_POLL_MS = 50;
const OPTIMIZER_WAIT_LIMIT_MS = 30_000;

export interface StartupWarmup {
  readonly done: Promise<void>;
  run(environment: DevEnvironment, entryUrls: readonly string[]): Promise<number>;
}

export function createStartupWarmup(): StartupWarmup {
  let markDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    markDone = resolve;
  });
  return {
    done,
    async run(environment, entryUrls) {
      try {
        await depsOptimizerFirstRun(environment, performance.now() + OPTIMIZER_WAIT_LIMIT_MS);
        return await warmModuleGraph(environment, entryUrls);
      } finally {
        markDone?.();
      }
    },
  };
}

export async function warmModuleGraph(environment: DevEnvironment, entryUrls: readonly string[]): Promise<number> {
  const visited = new Set<string>();
  const visit = async (url: string): Promise<void> => {
    if (visited.has(url) || environment.depsOptimizer?.isOptimizedDepUrl(url)) return;
    visited.add(url);
    await environment.warmupRequest(url);
    const module = await environment.moduleGraph.getModuleByUrl(url);
    await Promise.all([...(module?.importedModules ?? [])].map((imported) => visit(imported.url)));
  };
  await Promise.all(entryUrls.map(visit));
  return visited.size;
}

async function depsOptimizerFirstRun(environment: DevEnvironment, deadline: number): Promise<void> {
  if (!environment.depsOptimizer || hasOptimizedDeps(environment) || performance.now() >= deadline) return;
  await delay(OPTIMIZER_POLL_MS);
  await depsOptimizerFirstRun(environment, deadline);
}

function hasOptimizedDeps(environment: DevEnvironment): boolean {
  return Object.keys(environment.depsOptimizer?.metadata.optimized ?? {}).length > 0;
}
