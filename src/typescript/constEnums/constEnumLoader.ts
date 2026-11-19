export type ConstEnumCheck = (code: string, file: string) => string | undefined;

interface LoaderContext {
  resourcePath: string;
  getOptions(): { check: ConstEnumCheck };
  emitError(error: Error): void;
  callback(error: null, code: string, map?: unknown): void;
}

function constEnumLoader(this: LoaderContext, code: string, map?: unknown): void {
  const message = this.getOptions().check(code, this.resourcePath);
  if (message !== undefined) this.emitError(new Error(message));
  this.callback(null, code, map);
}

export default constEnumLoader;
