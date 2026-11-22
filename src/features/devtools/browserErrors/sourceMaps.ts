import { SourceMap, type SourceMapPayload, type SourceMapping } from 'node:module';
import path from 'node:path';

export interface SourcePosition {
  file: string;
  line: number;
  column?: number;
}

export type OutputReader = (file: string) => Promise<string | undefined>;

const WEBPACK_SOURCE = /^webpack:\/\/[^/]*\//;
const NEXT_MAPPING_SEARCH_LINES = 2000;
const END_OF_LINE = Number.MAX_SAFE_INTEGER;

function isMapped(entry: SourceMapping | object): entry is SourceMapping {
  return 'originalSource' in entry;
}

function nextSourceMapping(map: SourceMap, generatedLine: number): SourceMapping | undefined {
  for (let next = generatedLine + 1; next <= generatedLine + NEXT_MAPPING_SEARCH_LINES; next += 1) {
    const entry = map.findEntry(next, END_OF_LINE);
    if (!isMapped(entry)) return undefined;
    if (entry.generatedLine > generatedLine) return entry;
  }
  return undefined;
}

function entryOfLine(map: SourceMap, generatedLine: number, generatedColumn: number): SourceMapping | undefined {
  const entry = map.findEntry(generatedLine, generatedColumn);
  if (!isMapped(entry)) return undefined;
  if (entry.generatedLine === generatedLine) return entry;
  const next = nextSourceMapping(map, generatedLine);
  return next?.originalSource === entry.originalSource ? next : undefined;
}

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
    const entry = map === undefined ? undefined : entryOfLine(map, line - 1, column - 1);
    if (entry === undefined) return undefined;
    const position: SourcePosition = { file: sourceFilePath(this.root, entry.originalSource), line: entry.originalLine + 1 };
    const ownLine = entry.generatedLine === line - 1;
    return ownLine && this.withColumns() ? { ...position, column: entry.originalColumn + 1 } : position;
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
