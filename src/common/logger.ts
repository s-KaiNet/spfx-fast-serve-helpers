/* eslint-disable no-console */
import colors from 'colors';
import { serveSettings } from './settingsManager';

export class Logger {
  static log(message: string) {
    console.log(`${this.baseMessage()} ${message}`);
  }

  static error(message: string) {
    if (!message) {
      message = 'An unexpected error occurred';
    }
    console.log(`${this.baseMessage()} ${colors.red(message)}`);
  }

  static debug(...messages: any[]) {
    if (!serveSettings.debug) return;

    for (const message of messages) {
      if (typeof message === 'string') {
        console.log(`${this.baseMessage()} ${colors.yellow(message)}`);
      } else {
        console.log(message);
      }
    }
  }

  private static baseMessage() {
    return `${this.getTimeString()} [${colors.cyan('fast-serve')}]`;
  }

  private static getTimeString() {
    const now = new Date();
    return `[${colors.gray(`${('0' + now.getHours()).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`)}]`;
  }
}

