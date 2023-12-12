import colors from 'colors';

export class Logger {
  static log(message: string) {
    console.log(`${this.baseMessage()} ${message}`);
  }

  static error(message: string) {
    console.log(`${this.baseMessage()} ${colors.red(message)}`);
  }

  private static baseMessage() {
    return `${this.getTimeString()} [${colors.cyan('fast-serve')}]`;
  }

  private static getTimeString() {
    const now = new Date();
    return `[${colors.gray(`${('0' + now.getHours()).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`)}]`;
  }
}

