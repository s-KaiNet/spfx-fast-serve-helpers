const SITE_CACHE_PREFIX = 'Site-';

async function removeCachedTunnelResponses(host: string): Promise<number> {
  const siteCaches = (await caches.keys()).filter((name) => name.startsWith(SITE_CACHE_PREFIX));
  const removed = await Promise.all(
    siteCaches.map(async (name) => {
      const cache = await caches.open(name);
      const tunnelRequests = (await cache.keys()).filter((request) => request.url.includes(host));
      const deleted = await Promise.all(tunnelRequests.map((request) => cache.delete(request)));
      return deleted.filter(Boolean).length;
    }),
  );
  return removed.reduce((total, count) => total + count, 0);
}

export function clearTunnelCaches(host: string): void {
  if (!('caches' in window)) return;
  removeCachedTunnelResponses(host)
    .then((removed) => {
      if (removed > 0) console.info(`[fast-serve] removed ${removed} cached response(s) from ${host} (SharePoint mobile cache)`);
    })
    .catch(() => undefined);
}
