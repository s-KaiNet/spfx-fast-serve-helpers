import type { SpfxBundle } from '../project/index.js';
import { toRootUrl } from '../utils/paths.js';

export function renderBundleEntry(root: string, bundle: SpfxBundle): string {
  const component = bundle.components[0];
  if (!component) throw new Error(`Bundle "${bundle.name}" has no supported components`);

  const entry = JSON.stringify(toRootUrl(root, component.entryFile));
  return [
    "import '@vitejs/plugin-react/preamble';",
    `export * from ${entry};`,
    `export { default } from ${entry};`,
    'if (import.meta.hot) import.meta.hot.accept(() => location.reload());',
    '',
  ].join('\n');
}
