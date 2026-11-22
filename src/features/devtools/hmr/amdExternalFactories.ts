const ORIGINALS_PROPERTY = 'fastServeAmdExternalFactories';

export function keepAmdExternalFactoriesSource(globalObject: string, hotUpdateGlobal: string, externalRequests: readonly string[]): string {
  const name = JSON.stringify(hotUpdateGlobal);
  return [
    '(function (root, modules, ids) {',
    `  var originals = __webpack_require__.${ORIGINALS_PROPERTY} = __webpack_require__.${ORIGINALS_PROPERTY} || ids.reduce(function (found, id) {`,
    '    if (Object.prototype.hasOwnProperty.call(modules, id)) found[id] = modules[id];',
    '    return found;',
    '  }, Object.create(null));',
    `  var receive = root[${name}];`,
    `  root[${name}] = function (chunkId, moreModules, runtime) {`,
    '    var own = moreModules;',
    '    for (var id in originals) {',
    '      if (!moreModules || !Object.prototype.hasOwnProperty.call(moreModules, id)) continue;',
    '      if (own === moreModules) own = Object.assign({}, moreModules);',
    '      own[id] = originals[id];',
    '    }',
    '    return receive.call(this, chunkId, own, runtime);',
    '  };',
    `})(${globalObject}, __webpack_require__.m, ${JSON.stringify(externalRequests)});`,
  ].join('\n');
}
