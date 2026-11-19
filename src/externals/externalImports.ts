import path from 'node:path';
import { MagicString } from 'magic-string';
import { parseSync, Visitor, type ESTree, type Plugin } from 'vite';
import type { Logger } from '../logger.js';
import { isProjectScript, NODE_MODULES_ID, PROJECT_SCRIPT_ID } from '../transforms/projectSource.js';
import { toPosix } from '../utils/paths.js';
import { EXTERNAL_MODULE_EXPORT, EXTERNAL_NAMESPACE_EXPORT } from './facade.js';

const MODULE_SYNTAX = /\b(?:import|export)\b/;
const LOCAL_PREFIX = '__spfxExternal';

export type IsConfigExternal = (specifier: string) => boolean;

export interface RewrittenExternalImports {
  readonly code: string;
  readonly map: ReturnType<MagicString['generateMap']>;
  readonly starReexports: readonly string[];
}

export interface ExternalImportsOptions {
  readonly root: string;
  readonly logger: Pick<Logger, 'warn'>;
  readonly configExternalNames: () => Iterable<string>;
  readonly isConfigExternal: IsConfigExternal;
}

export function externalImportsPlugin({ root, logger, configExternalNames, isConfigExternal }: ExternalImportsOptions): Plugin {
  const reportedStarReexports = new Set<string>();
  return {
    name: 'fast-serve:external-imports',
    apply: 'serve',
    transform: {
      filter: { id: { include: PROJECT_SCRIPT_ID, exclude: NODE_MODULES_ID }, code: MODULE_SYNTAX },
      handler(code, id) {
        if (!isProjectScript(root, id) || !mentionsAny(code, configExternalNames())) return null;
        const rewritten = rewriteExternalImports(code, id, isConfigExternal);
        if (!rewritten) return null;
        for (const name of rewritten.starReexports) {
          const file = toPosix(path.relative(root, id.split('?', 1)[0] ?? id));
          const key = `${file}\0${name}`;
          if (reportedStarReexports.has(key)) continue;
          reportedStarReexports.add(key);
          logger.warn(
            `${file}: \`export * from '${name}'\` re-exports nothing: the names of the config/config.json external "${name}" are only known at runtime. ` +
              `Re-export the names you need (\`export { render } from '${name}'\`) or the whole module (\`export * as ${toIdentifier(name)} from '${name}'\`).`,
          );
        }
        return rewritten.code === code ? null : { code: rewritten.code, map: rewritten.map };
      },
    },
  };
}

export function rewriteExternalImports(
  code: string,
  id: string,
  isConfigExternal: IsConfigExternal,
  lang: 'js' | 'ts' = 'js',
): RewrittenExternalImports | null {
  const { program, errors } = parseSync(id, code, { lang, sourceType: 'module' });
  if (errors.length > 0) return null;

  const output = new MagicString(code);
  const starReexports: string[] = [];
  const locals = localNames(code);
  const isExternalSource = (source: ESTree.StringLiteral | null): source is ESTree.StringLiteral =>
    source !== null && source.value !== '' && isConfigExternal(source.value);

  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      if (isExternalSource(node.source) && node.attributes.length === 0) rewriteImport(output, node, locals);
    } else if (node.type === 'ExportNamedDeclaration') {
      if (isExternalSource(node.source) && node.attributes.length === 0) rewriteNamedReexport(output, node, node.source, locals);
    } else if (node.type === 'ExportAllDeclaration' && isExternalSource(node.source) && node.exportKind !== 'type') {
      if (node.exported) {
        output.overwrite(node.start, node.end, `export { ${EXTERNAL_MODULE_EXPORT} as ${exportName(node.exported)} } from ${JSON.stringify(node.source.value)};`);
      } else {
        starReexports.push(node.source.value);
      }
    }
  }
  rewriteDynamicImports(output, program, isConfigExternal);

  if (!output.hasChanged() && starReexports.length === 0) return null;
  return { code: output.toString(), map: output.generateMap({ hires: 'boundary', source: id, includeContent: true }), starReexports };
}

function rewriteImport(output: MagicString, node: ESTree.ImportDeclaration, locals: () => string): void {
  if (node.importKind === 'type') return;
  const defaults: string[] = [];
  const named: { local: string; imported: string }[] = [];
  let namespace: string | undefined;
  for (const specifier of node.specifiers) {
    if (specifier.type === 'ImportDefaultSpecifier') defaults.push(specifier.local.name);
    else if (specifier.type === 'ImportNamespaceSpecifier') namespace = specifier.local.name;
    else if (specifier.importKind === 'type') continue;
    else if (moduleExportName(specifier.imported) === 'default') defaults.push(specifier.local.name);
    else named.push({ local: specifier.local.name, imported: moduleExportName(specifier.imported) });
  }
  const hasTypeSpecifiers = node.specifiers.some((specifier) => specifier.type === 'ImportSpecifier' && specifier.importKind === 'type');
  if (namespace === undefined && named.length === 0 && !hasTypeSpecifiers) return;

  const moduleLocal = namespace ?? (named.length > 0 ? locals() : undefined);
  const bindings = [
    ...defaults.map((local) => `default as ${local}`),
    ...(moduleLocal === undefined ? [] : [`${EXTERNAL_MODULE_EXPORT} as ${moduleLocal}`]),
  ];
  const statement = bindings.length > 0 ? `import { ${bindings.join(', ')} } from ${JSON.stringify(node.source.value)};` : '';
  const reads = moduleLocal === undefined ? [] : named.map(({ local, imported }) => `${local} = ${propertyRead(moduleLocal, imported)}`);
  output.overwrite(node.start, node.end, [statement, ...(reads.length > 0 ? [`const ${reads.join(', ')};`] : [])].join(' '));
}

function rewriteNamedReexport(output: MagicString, node: ESTree.ExportNamedDeclaration, source: ESTree.StringLiteral, locals: () => string): void {
  if (node.exportKind === 'type') return;
  const specifiers = node.specifiers.filter((specifier) => specifier.exportKind !== 'type');
  const reexportsOnlyDefault = specifiers.every((specifier) => moduleExportName(specifier.local) === 'default');
  if (reexportsOnlyDefault && specifiers.length === node.specifiers.length) return;
  if (specifiers.length === 0) {
    output.remove(node.start, node.end);
    return;
  }

  const moduleLocal = reexportsOnlyDefault ? undefined : locals();
  const values = specifiers.map((specifier) => ({ imported: moduleExportName(specifier.local), local: locals(), exported: exportName(specifier.exported) }));
  const importedDefaults = values.filter(({ imported }) => imported === 'default');
  const bindings = [
    ...importedDefaults.map(({ local }) => `default as ${local}`),
    ...(moduleLocal === undefined ? [] : [`${EXTERNAL_MODULE_EXPORT} as ${moduleLocal}`]),
  ];
  const reads = moduleLocal === undefined ? [] : values.filter(({ imported }) => imported !== 'default').map(({ imported, local }) => `${local} = ${propertyRead(moduleLocal, imported)}`);
  output.overwrite(
    node.start,
    node.end,
    [
      `import { ${bindings.join(', ')} } from ${JSON.stringify(source.value)};`,
      ...(reads.length > 0 ? [`const ${reads.join(', ')};`] : []),
      `export { ${values.map(({ local, exported }) => `${local} as ${exported}`).join(', ')} };`,
    ].join(' '),
  );
}

function rewriteDynamicImports(output: MagicString, program: ESTree.Program, isConfigExternal: IsConfigExternal): void {
  new Visitor({
    ImportExpression(node) {
      const { source } = node;
      if (node.options !== null || node.phase !== null || source.type !== 'Literal' || typeof source.value !== 'string' || !isConfigExternal(source.value)) return;
      output.appendLeft(node.end, `.then((module) => module.${EXTERNAL_NAMESPACE_EXPORT})`);
    },
  }).visit(program);
}

function moduleExportName(node: ESTree.ModuleExportName): string {
  return node.type === 'Literal' ? node.value : node.name;
}

function exportName(node: ESTree.ModuleExportName): string {
  return node.type === 'Literal' ? JSON.stringify(node.value) : node.name;
}

function propertyRead(moduleLocal: string, name: string): string {
  return `${moduleLocal}?.[${JSON.stringify(name)}]`;
}

function localNames(code: string): () => string {
  let index = 0;
  return () => {
    let name = `${LOCAL_PREFIX}${index++}`;
    while (code.includes(name)) name = `${LOCAL_PREFIX}${index++}`;
    return name;
  };
}

function mentionsAny(code: string, names: Iterable<string>): boolean {
  for (const name of names) {
    if (code.includes(`"${name}"`) || code.includes(`'${name}'`)) return true;
  }
  return false;
}

function toIdentifier(name: string): string {
  const identifier = name.replace(/^@[^/]+\//, '').replaceAll(/[^\w$]+(.)?/g, (_, next: string | undefined) => next?.toUpperCase() ?? '');
  return /^[A-Za-z_$]/.test(identifier) ? identifier : `_${identifier}`;
}
