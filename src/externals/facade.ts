export const FAST_SERVE_GLOBAL = '__spfxFastServe';

export function renderFacadeModule(packageName: string, exportNames: readonly string[]): string {
  const name = JSON.stringify(packageName);
  const missing = JSON.stringify(
    `[fast-serve] "${packageName}" was not preloaded by SharePoint. It is probably a new import: reload the page.`,
  );
  return [
    `const m = (window.${FAST_SERVE_GLOBAL} && window.${FAST_SERVE_GLOBAL}.externals || {})[${name}];`,
    `if (!m) throw new Error(${missing});`,
    'export default (m.default !== undefined ? m.default : m);',
    ...exportNames.map((exportName, i) => `const __e${i} = m[${JSON.stringify(exportName)}];\nexport { __e${i} as ${exportName} };`),
    '',
  ].join('\n');
}
