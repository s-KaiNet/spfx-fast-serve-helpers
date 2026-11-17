import path from 'node:path';
import type { Plugin, Rolldown } from 'vite';
import type { ServeContext } from '../context.js';
import { toPosix } from '../utils/paths.js';
import { BARE_SPECIFIER_FILTER, isStyleRequest } from '../utils/vite.js';
import { readLocFile, renderLocModule, type LocFile } from './locModule.js';

const VIRTUAL_PREFIX = '\0spfx-loc:';

export function localizationPlugin(context: ServeContext): Plugin {
  const resources = () => context.project.localizedResources(context.options.locale);
  const warnedModuleLocFiles = new Set<string>();

  const warnAboutHeftIncompatibleFormat = (name: string, file: string, locFile: LocFile) => {
    if (locFile.format === 'amd' || warnedModuleLocFiles.has(file)) return;
    warnedModuleLocFiles.add(file);
    context.logger.warn(
      `${name}: ${toPosix(path.relative(context.root, file))} is an ES/CommonJS module. fast-serve loads it, but heft copies ` +
        'the compiled lib/ file into dist/ as is and SharePoint loads it with RequireJS, which needs ' +
        '`define([], function () { return { ... }; });`',
    );
  };

  const prebundlePlugin: Rolldown.Plugin = {
    name: 'fast-serve:localization-prebundle',
    resolveId: {
      filter: { id: BARE_SPECIFIER_FILTER },
      handler: (source) => (resources().has(source) ? { id: source, external: true } : null),
    },
  };

  return {
    name: 'fast-serve:localization',
    enforce: 'pre',
    config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [prebundlePlugin] } } }),
    resolveId(source, importer) {
      if (isStyleRequest(importer) || !resources().has(source)) return null;
      return VIRTUAL_PREFIX + source;
    },
    async load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;
      const resource = resources().get(id.slice(VIRTUAL_PREFIX.length));
      if (!resource) return null;
      this.addWatchFile(resource.file);
      const locFile = await readLocFile(resource.file);
      for (const file of locFile.files) this.addWatchFile(file);
      warnAboutHeftIncompatibleFormat(resource.name, resource.file, locFile);
      return renderLocModule(locFile.strings);
    },
  };
}
