import { describe, expect, it, vi } from 'vitest';
import { closeOnShutdownSignal } from './shutdown.js';

function fakeSignals() {
  const listeners = new Map<string, () => void>();
  return { listeners, source: { once: (signal: string, listener: () => void) => listeners.set(signal, listener) } };
}

describe('closeOnShutdownSignal', () => {
  it('closes once on SIGINT or SIGTERM and exits with 0', async () => {
    const { listeners, source } = fakeSignals();
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const exit = vi.fn<(code: number) => void>();
    closeOnShutdownSignal(close, exit, source);
    expect([...listeners.keys()]).toEqual(['SIGINT', 'SIGTERM']);
    listeners.get('SIGINT')?.();
    listeners.get('SIGTERM')?.();
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(0);
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('exits with 1 when closing fails', async () => {
    const { listeners, source } = fakeSignals();
    const exit = vi.fn<(code: number) => void>();
    closeOnShutdownSignal(() => Promise.reject(new Error('busy')), exit, source);
    listeners.get('SIGTERM')?.();
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});
