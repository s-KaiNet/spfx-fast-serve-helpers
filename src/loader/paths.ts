const SHIM_PREFIX = '/@spfx/bundle/';
const ENTRY_PREFIX = '/@spfx/entry/';

export function bundleShimPath(bundleName: string): string {
  return `${SHIM_PREFIX.slice(1)}${encodeURIComponent(bundleName)}.js`;
}

export function parseBundleShimPath(urlPath: string): string | undefined {
  if (!urlPath.startsWith(SHIM_PREFIX) || !urlPath.endsWith('.js')) return undefined;
  return decodeURIComponent(urlPath.slice(SHIM_PREFIX.length, -'.js'.length));
}

export function bundleEntryPath(bundleName: string): string {
  return `${ENTRY_PREFIX}${encodeURIComponent(bundleName)}`;
}

export function parseBundleEntryPath(source: string): string | undefined {
  return source.startsWith(ENTRY_PREFIX) ? decodeURIComponent(source.slice(ENTRY_PREFIX.length)) : undefined;
}
