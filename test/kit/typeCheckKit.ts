import { request } from 'node:https';
import { copyCompileFixture, packageDirectory, type FixtureCopy } from './compileKit.js';

const HEFT_PACKAGES = ['@rushstack/heft-config-file', '@rushstack/rig-package', '@rushstack/heft-static-asset-typings-plugin'];

const TSCONFIG = {
  compilerOptions: {
    target: 'es2017',
    module: 'esnext',
    moduleResolution: 'node',
    jsx: 'react',
    strict: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    types: [],
    lib: ['dom', 'es2017'],
    rootDirs: ['src', 'temp/static-asset-ts'],
    outDir: 'lib',
  },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
};

const DECLARATIONS = `declare module '@microsoft/sp-core-library' { export class Version { static parse(value: string): Version; } }
declare module '@microsoft/sp-webpart-base' { export class BaseClientSideWebPart { readonly context: unknown; } }
declare module '@microsoft/microsoft-graph-client' { export class GraphClient {} }
declare module 'HelloWebPartStrings' { export const Title: string; }
declare module 'nested-react-user' { export function nestedReactVersion(): string; }
declare module 'react';
declare namespace JSX { interface IntrinsicElements { [name: string]: unknown } }
declare const process: { env: Record<string, string | undefined> };
`;

export function typeCheckFixture(): FixtureCopy {
  const fixture = copyCompileFixture({
    'tsconfig.json': TSCONFIG,
    'src/declarations.d.ts': DECLARATIONS,
    'config/static-asset-typings.json': { fileExtensions: ['.png'], generatedTsFolders: ['temp/static-asset-ts'] },
  });
  for (const name of HEFT_PACKAGES) fixture.linkPackage(name);
  fixture.linkLocalPackage('typescript', packageDirectory('typescript-5'));
  return fixture;
}

export interface ServerSentEvents {
  close(): void;
}

export function streamServerSentEvents(url: string, onData: (data: string) => void, onOpen: () => void = () => undefined): ServerSentEvents {
  let buffered = '';
  const req = request(url, { rejectUnauthorized: false }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buffered += chunk;
      const messages = buffered.split('\n\n');
      buffered = messages.pop() ?? '';
      for (const message of messages) {
        const data = message.split('\n').find((line) => line.startsWith('data: '));
        if (data !== undefined) onData(data.slice('data: '.length));
      }
    });
    onOpen();
  });
  req.on('error', () => undefined);
  req.end();
  return {
    close: () => {
      req.destroy();
    },
  };
}

export interface EventStream {
  events: unknown[];
  close(): void;
}

export function openEventStream(url: string): Promise<EventStream> {
  return new Promise((resolve) => {
    const events: unknown[] = [];
    const stream = streamServerSentEvents(
      url,
      (data) => events.push(JSON.parse(data)),
      () => {
        resolve({
          events,
          close: () => {
            stream.close();
          },
        });
      },
    );
  });
}

export interface PageEventSources {
  readonly EventSource: unknown;
  readonly urls: string[];
  closeAll(): void;
}

export function pageEventSources(rewrite: (url: string) => string = (url) => url): PageEventSources {
  const urls: string[] = [];
  const streams: ServerSentEvents[] = [];
  class NodeEventSource {
    private readonly listeners: ((event: { data: string }) => void)[] = [];

    constructor(url: string) {
      urls.push(url);
      streams.push(
        streamServerSentEvents(rewrite(url), (data) => {
          for (const listener of this.listeners) listener({ data });
        }),
      );
    }

    addEventListener(type: string, listener: (event: { data: string }) => void): void {
      if (type === 'message') this.listeners.push(listener);
    }
  }
  return {
    EventSource: NodeEventSource,
    urls,
    closeAll: () => {
      for (const stream of streams.splice(0)) stream.close();
    },
  };
}
