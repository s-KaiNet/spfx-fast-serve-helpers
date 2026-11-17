import { BROWSER_ERRORS_ID } from '../browserErrors/index.js';
import type { SpfxBundle, SpfxComponent } from '../project/index.js';
import { toRootUrl } from '../utils/paths.js';

export function renderBundleEntry(root: string, bundle: SpfxBundle): string {
  if (bundle.components.length === 0) throw new Error(`Bundle "${bundle.name}" has no supported components`);

  return [
    `import ${JSON.stringify(BROWSER_ERRORS_ID)};`,
    "import '@vitejs/plugin-react/preamble';",
    ...bundle.components.flatMap((component) => componentExports(root, component)),
    'if (import.meta.hot) import.meta.hot.accept(() => location.reload());',
    '',
  ].join('\n');
}

function componentExports(root: string, component: SpfxComponent): string[] {
  const entry = JSON.stringify(toRootUrl(root, component.entryFile));
  if (component.exportName !== undefined) return [`export * as ${component.exportName} from ${entry};`];
  return [`export * from ${entry};`, `export { default } from ${entry};`];
}
