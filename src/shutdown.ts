export interface SignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
}

export const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export function closeOnShutdownSignal(close: () => Promise<void>, exit: (code: number) => void, signals: SignalSource = process): void {
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    close().then(
      () => {
        exit(0);
      },
      () => {
        exit(1);
      },
    );
  };
  for (const signal of SHUTDOWN_SIGNALS) signals.once(signal, shutdown);
}
