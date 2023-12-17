/* eslint-disable no-console */
import colors from 'colors';
import { serveSettings } from './settingsManager';
import { program } from 'commander';
import { getNpmScriptValue } from './helpers';

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

  static debugEnvironmentInfo() {
    const command = getNpmScriptValue();
    const npmCommand = process.env.npm_lifecycle_event;

    Logger.debug(`fast-serve: ${program.version()}`, `node: ${process.version}`, `platform: ${process.platform}`, `command: ${command == null ? 'npx' : `npm[${npmCommand}]="${command}"`}`);

    Logger.debug('Settings:', serveSettings);
  }

  private static baseMessage() {
    return `${this.getTimeString()} [${colors.cyan('fast-serve')}]`;
  }

  private static getTimeString() {
    const now = new Date();
    return `[${colors.gray(`${('0' + now.getHours()).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`)}]`;
  }
}

