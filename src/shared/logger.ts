import { styleText } from 'node:util';

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

const PREFIX = '[fast-serve]';

export function createConsoleLogger(): Logger {
  return {
    info: (message) => {
      console.log(`${styleText('cyan', PREFIX)} ${message}`);
    },
    warn: (message) => {
      console.warn(`${styleText('yellow', PREFIX)} ${message}`);
    },
    error: (message) => {
      console.error(`${styleText('red', PREFIX)} ${message}`);
    },
  };
}
