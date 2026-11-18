type EmitWarning = typeof process.emitWarning;

interface WarningTarget {
  emitWarning: EmitWarning;
}

const HTTP2_STATUS_MESSAGE_WARNING = 'Status message is not supported by HTTP/2';

function warningName(warning: string | Error, typeOrOptions: unknown): string {
  if (warning instanceof Error) return warning.name;
  if (typeof typeOrOptions === 'string') return typeOrOptions;
  if (typeof typeOrOptions === 'object' && typeOrOptions !== null && 'type' in typeOrOptions && typeof typeOrOptions.type === 'string') {
    return typeOrOptions.type;
  }
  return 'Warning';
}

export function isHttp2StatusMessageWarning(warning: string | Error, typeOrOptions?: unknown): boolean {
  const message = warning instanceof Error ? warning.message : warning;
  return warningName(warning, typeOrOptions) === 'UnsupportedWarning' && typeof message === 'string' && message.startsWith(HTTP2_STATUS_MESSAGE_WARNING);
}

export function hideHttp2StatusMessageWarning(target: WarningTarget = process): void {
  const emitWarning = target.emitWarning;
  target.emitWarning = function filteredEmitWarning(this: unknown, ...args: Parameters<EmitWarning>) {
    if (isHttp2StatusMessageWarning(args[0], args[1])) return;
    Reflect.apply(emitWarning, this, args);
  } as EmitWarning;
}
