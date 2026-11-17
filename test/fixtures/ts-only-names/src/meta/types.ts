export class HttpClient {
  public get(): string {
    return 'ok';
  }
}
export interface ILogger {
  write(message: string): void;
}
export type Id = string;
export enum Mode {
  A,
  B,
}
