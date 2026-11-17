export interface StackFrame {
  readonly method: string;
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

export type FrameSource = 'project' | 'loader' | 'dependency' | 'other';

export const LOADER_PATH_PREFIX = '/@spfx/';

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

export function frameSource(url: string, origin: string): FrameSource {
  if (!url.startsWith(`${origin}/`)) return 'other';
  const { pathname } = new URL(url);
  if (pathname.startsWith(LOADER_PATH_PREFIX)) return 'loader';
  if (pathname.startsWith('/node_modules/')) return 'dependency';
  if (pathname.startsWith('/@')) return 'other';
  return 'project';
}

export function isOwnCode(source: FrameSource): boolean {
  return source === 'project' || source === 'loader';
}

export function referencesProjectCode(stacks: readonly string[], origin: string): boolean {
  return stacks.some((stack) => parseStackFrames(stack).some((frame) => isOwnCode(frameSource(frame.url, origin))));
}
