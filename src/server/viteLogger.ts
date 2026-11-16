import { stripVTControlCharacters } from 'node:util';
import { createLogger, type Logger as ViteLogger } from 'vite';

const REASONLESS_REJECTION = /^\[Unhandled rejection\] Unknown Error: (undefined|null)$/;

export function isReasonlessPageRejection(message: string): boolean {
  return REASONLESS_REJECTION.test(stripVTControlCharacters(message).trim());
}

export function createViteLogger(): ViteLogger {
  const logger = createLogger('info', { allowClearScreen: false });
  const logError = logger.error.bind(logger);
  logger.error = (message, options) => {
    if (!isReasonlessPageRejection(message)) logError(message, options);
  };
  return logger;
}
