import { readFileSync } from 'node:fs';
import type { Plugin, Rolldown } from 'vite';
import type { ServeContext } from '../context.js';
import { isStyleRequest } from '../utils/vite.js';
import { evaluateLocFile, renderLocModule } from './locModule.js';

const VIRTUAL_PREFIX = '\0spfx-loc:';

export function localizationPlugin(context: ServeContext): Plugin {
  const resources = () => context.project.localizedResources(context.options.locale);

  const prebundlePlugin: Rolldown.Plugin = {
    name: 'fast-serve:localization-prebundle',
    resolveId: (source) => (resources().has(source) ? { id: source, external: true } : null),
  };

  return {
    name: 'fast-serve:localization',
    enforce: 'pre',
    config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [prebundlePlugin] } } }),
    resolveId(source, importer) {
      if (isStyleRequest(importer) || !resources().has(source)) return null;
      return VIRTUAL_PREFIX + source;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;
      const resource = resources().get(id.slice(VIRTUAL_PREFIX.length));
      if (!resource) return null;
      this.addWatchFile(resource.file);
      return renderLocModule(evaluateLocFile(readFileSync(resource.file, 'utf8'), resource.file));
    },
  };
}
