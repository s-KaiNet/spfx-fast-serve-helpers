import { createLogger, type Logger as ViteLogger } from 'vite';

export function createViteLogger(): ViteLogger {
  return createLogger('info', { allowClearScreen: false });
}
