import { Injectable, Inject, Prop } from './container';
import { HttpClient, Mode } from "./types";
import type { ILogger, Id } from "./types";
import type { HttpClient as HttpClientType } from './types';

class LocalDep {}
interface ILocal {
  x: number;
}

@Injectable()
export class Consumer {
  @Prop() public client: HttpClient;
  @Prop() public logger: ILogger;
  @Prop() public local: LocalDep;
  @Prop() public maybe: string | undefined;
  @Prop() public mode: Mode;

  constructor(
    http: HttpClient,
    logger: ILogger,
    local: LocalDep,
    localIface: ILocal,
    id: Id,
    n: number,
    @Inject('t') typeOnly: HttpClientType,
    list: string[],
    fn: () => void,
  ) {}

  @Prop()
  public method(a: HttpClient, b: ILogger): Promise<Id> {
    return Promise.resolve('x');
  }
}

export function readMetadata(): Record<string, unknown> {
  const name = (value: unknown) => (typeof value === 'function' ? value.name : String(value));
  const r = Reflect as unknown as { getMetadata(key: string, target: object, prop?: string): unknown };
  const list = (value: unknown) => (Array.isArray(value) ? value.map(name) : value);
  return {
    paramtypes: list(r.getMetadata('design:paramtypes', Consumer)),
    client: name(r.getMetadata('design:type', Consumer.prototype, 'client')),
    logger: name(r.getMetadata('design:type', Consumer.prototype, 'logger')),
    local: name(r.getMetadata('design:type', Consumer.prototype, 'local')),
    maybe: name(r.getMetadata('design:type', Consumer.prototype, 'maybe')),
    mode: name(r.getMetadata('design:type', Consumer.prototype, 'mode')),
    methodParams: list(r.getMetadata('design:paramtypes', Consumer.prototype, 'method')),
    methodReturn: name(r.getMetadata('design:returntype', Consumer.prototype, 'method')),
  };
}
