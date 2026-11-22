export interface StackFrame {
  readonly method: string;
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

const FRAME_LOCATION = /(https?:\/\/[^\s()]+?):(\d+):(\d+)\)?\s*$/;
const V8_METHOD = /^\s*at\s+(?:async\s+)?(.+?)\s+\(/;
const FIREFOX_METHOD = /^\s*([^@\s]*)@/;

export function parseStackFrames(stack: string): StackFrame[] {
  return stack.split('\n').flatMap((line) => {
    const location = FRAME_LOCATION.exec(line);
    if (!location) return [];
    const [, url = '', lineNumber = '0', columnNumber = '0'] = location;
    const method = V8_METHOD.exec(line)?.[1] ?? FIREFOX_METHOD.exec(line)?.[1] ?? '';
    return [{ method, url, line: Number(lineNumber), column: Number(columnNumber) }];
  });
}

export function servedFile(url: string, distUrl: string): string | undefined {
  if (!url.startsWith(distUrl)) return undefined;
  const file = url.slice(distUrl.length).split(/[?#]/)[0] ?? '';
  try {
    return file === '' ? undefined : decodeURIComponent(file);
  } catch {
    return undefined;
  }
}
