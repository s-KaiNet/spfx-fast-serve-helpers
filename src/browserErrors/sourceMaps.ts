import { SourceMap, type SourceMapPayload } from 'node:module';
import path from 'node:path';

export interface SourcePosition {
  file: string;
  line: number;
  column?: number;
}

export type OutputReader = (file: string) => Promise<string | undefined>;

const WEBPACK_SOURCE = /^webpack:\/\/[^/]*\//;

export class BundleSourceMaps {
  private readonly maps = new Map<string, Promise<SourceMap | undefined>>();

  constructor(
    private readonly root: string,
    private readonly readOutput: OutputReader,
    private readonly withColumns: () => boolean,
  ) {}

  forget(): void {
    this.maps.clear();
  }

  async originOf(servedFile: string, line: number, column: number): Promise<SourcePosition | undefined> {
    const map = await this.mapOf(servedFile);
    const origin = map?.findOrigin(line, column);
    if (origin === undefined || !('fileName' in origin)) return undefined;
    const position: SourcePosition = { file: sourceFilePath(this.root, origin.fileName), line: origin.lineNumber };
    return this.withColumns() ? { ...position, column: origin.columnNumber } : position;
  }

  private mapOf(servedFile: string): Promise<SourceMap | undefined> {
    let map = this.maps.get(servedFile);
    if (map === undefined) {
      map = this.loadMap(servedFile);
      this.maps.set(servedFile, map);
    }
    return map;
  }

  private async loadMap(servedFile: string): Promise<SourceMap | undefined> {
    const text = await this.readOutput(`${servedFile}.map`);
    if (text === undefined) return undefined;
    try {
      return new SourceMap(JSON.parse(text) as SourceMapPayload);
    } catch {
      return undefined;
    }
  }
}

export function sourceFilePath(root: string, source: string): string {
  if (!WEBPACK_SOURCE.test(source)) return path.resolve(root, source);
  return path.resolve(root, 'dist', source.replace(WEBPACK_SOURCE, ''));
}
