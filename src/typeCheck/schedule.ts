import type { Compiler } from '@rspack/core';
import type { FilesChange } from 'ts-checker-rspack-plugin/lib/files-change.js';
import type { TsCheckerRspackPluginHooks } from 'ts-checker-rspack-plugin/lib/plugin-hooks.js';
import type { PageChannel } from '../featureApi/index.js';

const PLUGIN_NAME = 'fast-serve:type-check-schedule';
export const INVALIDATE_DELAY_MS = 100;

export interface CheckSchedule {
  readonly closed: () => boolean;
}

export function scheduleChecks(compiler: Compiler, hooks: Pick<TsCheckerRspackPluginHooks, 'start'>, page: Pick<PageChannel, 'onTypingsUpdated'>): CheckSchedule {
  const heldChecks: (() => void)[] = [];
  const changedTypings = new Set<string>();
  const removedTypings = new Set<string>();
  let compiled = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const invalidateSoon = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (!closed) compiler.watching?.invalidate();
    }, INVALIDATE_DELAY_MS);
  };

  compiler.hooks.done.tap(PLUGIN_NAME, () => {
    if (compiled) return;
    compiled = true;
    for (const release of heldChecks.splice(0)) release();
    invalidateSoon();
  });
  compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
    closed = true;
    clearTimeout(timer);
  });

  page.onTypingsUpdated(({ written, removed }) => {
    for (const file of written) {
      removedTypings.delete(file);
      changedTypings.add(file);
    }
    for (const file of removed) {
      changedTypings.delete(file);
      removedTypings.add(file);
    }
    if (compiled) invalidateSoon();
  });

  hooks.start.tapPromise(PLUGIN_NAME, async (change: FilesChange) => {
    if (!compiled) {
      await new Promise<void>((resolve) => {
        heldChecks.push(resolve);
      });
    }
    if (changedTypings.size === 0 && removedTypings.size === 0) return change;
    const withTypings = {
      changedFiles: [...(change.changedFiles ?? []), ...changedTypings],
      deletedFiles: [...(change.deletedFiles ?? []), ...removedTypings],
    };
    changedTypings.clear();
    removedTypings.clear();
    return withTypings;
  });

  return { closed: () => closed };
}
