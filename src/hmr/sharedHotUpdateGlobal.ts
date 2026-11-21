import type { Compiler, RspackPluginInstance } from '@rspack/core';
import { keepAmdExternalFactoriesSource } from './amdExternalFactories.js';

const PLUGIN_NAME = 'fast-serve:shared-hot-update-global';
const HANDLERS_SUFFIX = '_fastServeHandlers';

export class SharedHotUpdateGlobalPlugin implements RspackPluginInstance {
  readonly #amdExternals: readonly string[];

  constructor(amdExternals: readonly string[] = []) {
    this.#amdExternals = amdExternals;
  }

  apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      const { hotUpdateGlobal } = compilation.outputOptions;
      if (hotUpdateGlobal === undefined) return;
      compilation.hooks.runtimeModule.tap(PLUGIN_NAME, (module) => {
        const { source } = module;
        if (!source) return;
        const code = source.source.toString();
        const globalObject = assignedGlobalObject(code, hotUpdateGlobal);
        if (globalObject === undefined) return;
        const keepExternals = this.#amdExternals.length > 0 ? `\n${keepAmdExternalFactoriesSource(globalObject, hotUpdateGlobal, this.#amdExternals)}` : '';
        source.source = Buffer.from(`${code}${keepExternals}\n${hotUpdateFanOutSource(globalObject, hotUpdateGlobal)}`);
      });
    });
  }
}

export function assignedGlobalObject(code: string, hotUpdateGlobal: string): string | undefined {
  const quotedName = JSON.stringify(hotUpdateGlobal).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`([\\w.$]+)\\[${quotedName}\\]\\s*=(?!=)`).exec(code)?.[1];
}

export function hotUpdateFanOutSource(globalObject: string, hotUpdateGlobal: string): string {
  const name = JSON.stringify(hotUpdateGlobal);
  const handlersName = JSON.stringify(`${hotUpdateGlobal}${HANDLERS_SUFFIX}`);
  return [
    '(function (root) {',
    `  var handlers = root[${handlersName}] = root[${handlersName}] || [];`,
    `  handlers.push(root[${name}]);`,
    `  root[${name}] = function () {`,
    '    for (var index = 0; index < handlers.length; index++) handlers[index].apply(this, arguments);',
    '  };',
    `})(${globalObject});`,
  ].join('\n');
}
