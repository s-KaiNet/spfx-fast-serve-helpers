const RETIRED_WORKBENCH_PATH = /\/_layouts\/(?:15\/)?workbench\.aspx(?:[?#]|$)/i;

export function isRetiredWorkbenchUrl(pageUrl: string): boolean {
  return RETIRED_WORKBENCH_PATH.test(pageUrl);
}

export function retiredWorkbenchWarning(source: string, pageUrl: string): string {
  return (
    `${source} "${pageUrl}" is the deprecated SharePoint Online workbench (retirement: December 1, 2026): ` +
    'fast-serve ignores it, set it to a SharePoint page of your site (for example https://{tenantDomain}/sites/dev/SitePages/Test.aspx)'
  );
}
