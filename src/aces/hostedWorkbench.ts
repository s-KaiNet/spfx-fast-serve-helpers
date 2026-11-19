export const HOSTED_WORKBENCH_PATH = '/_layouts/15/workbench.aspx';
export const HOSTED_WORKBENCH_RETIREMENT = '2026-12-01';

const SITE_CONTENT_SEGMENTS = new Set(['sitepages', 'pages', 'lists', '_layouts', 'shared documents', 'forms']);
const SITE_COLLECTION_PREFIXES = new Set(['sites', 'teams']);
const WORKBENCH_PATH = /\/_layouts\/(?:15\/)?workbench\.aspx$/i;

export function isHostedWorkbench(pageUrl: string): boolean {
  const url = URL.parse(pageUrl);
  return url !== null && WORKBENCH_PATH.test(url.pathname);
}

export function hostedWorkbenchUrl(pageUrl: string): string | undefined {
  const url = URL.parse(pageUrl);
  if (url === null) return undefined;
  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  const contentIndex = segments.findIndex((segment) => SITE_CONTENT_SEGMENTS.has(safeDecode(segment).toLowerCase()));
  const siteSegments = contentIndex !== -1 ? segments.slice(0, contentIndex) : siteCollectionSegments(segments);
  return `${url.origin}${siteSegments.map((segment) => `/${segment}`).join('')}${HOSTED_WORKBENCH_PATH}`;
}

function siteCollectionSegments(segments: readonly string[]): readonly string[] {
  const [prefix] = segments;
  return prefix !== undefined && SITE_COLLECTION_PREFIXES.has(prefix.toLowerCase()) ? segments.slice(0, 2) : [];
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
