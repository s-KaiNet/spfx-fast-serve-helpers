import type { Configuration, DevServer } from '@rspack/core';

type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function mergeValues(base: unknown, extension: unknown): unknown {
  if (extension === undefined) return base;
  if (Array.isArray(base) && Array.isArray(extension)) return [...(base as unknown[]), ...(extension as unknown[])];
  if (isPlainObject(base) && isPlainObject(extension)) {
    const merged: PlainObject = { ...base };
    for (const [key, value] of Object.entries(extension)) merged[key] = mergeValues(base[key], value);
    return merged;
  }
  return extension;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as unknown[]) : [value];
}

export function mergeRspackConfig(base: Configuration, extension: Configuration): Configuration {
  const { externals, devServer: _devServer, ...rest } = extension;
  const merged = mergeValues(base, rest) as Configuration;
  if (externals !== undefined) merged.externals = [...asArray(base.externals), ...asArray(externals)] as Configuration['externals'];
  return merged;
}

type HeadersFunction = Extract<NonNullable<DevServer['headers']>, (...args: never[]) => unknown>;

function headersOf(headers: DevServer['headers'], ...args: Parameters<HeadersFunction>): unknown {
  return typeof headers === 'function' ? headers(...args) : headers;
}

function toHeaderRecord(headers: unknown): Record<string, unknown> {
  if (Array.isArray(headers)) {
    return Object.fromEntries((headers as { key: string; value: unknown }[]).map(({ key, value }) => [key, value]));
  }
  return isPlainObject(headers) ? headers : {};
}

export function mergeDevServer(base: DevServer, extension: DevServer | undefined): DevServer {
  if (extension === undefined) return base;
  const { headers, setupMiddlewares, ...rest } = extension;
  const merged = mergeValues(base, rest) as DevServer;
  if (headers !== undefined) {
    const baseHeaders = base.headers;
    merged.headers = (...args: Parameters<HeadersFunction>) =>
      ({ ...toHeaderRecord(headersOf(baseHeaders, ...args)), ...toHeaderRecord(headersOf(headers, ...args)) }) as ReturnType<HeadersFunction>;
  }
  if (setupMiddlewares !== undefined) {
    const baseSetup = base.setupMiddlewares;
    merged.setupMiddlewares = (middlewares, server) => setupMiddlewares(baseSetup ? baseSetup(middlewares, server) : middlewares, server);
  }
  return merged;
}
