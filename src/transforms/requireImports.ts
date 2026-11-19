import path from 'node:path';
import { MagicString } from 'magic-string';
import { parseSync, type ESTree, type Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { EXTERNAL_MODULE_EXPORT } from '../externals/facade.js';
import { matchesPathAlias } from '../project/index.js';
import { toPosix } from '../utils/paths.js';
import { isStyleRequest, withoutQuery } from '../utils/vite.js';
import { isProjectScript, NODE_MODULES_ID, PROJECT_SCRIPT_ID } from './projectSource.js';
import { isShadowed, walkWithAncestors, type SyntaxNode } from './scope.js';

const REQUIRE_CALL = /\brequire\s*\(/;
const RELATIVE_SPECIFIER = /^\.\.?(?:\/|$)/;
const URL_SPECIFIER = /^[a-z][\w+.-]*:/i;
const SCRIPT_SPECIFIER = /\.[cm]?[jt]sx?$/;
const PACKAGE_ASSET =
  /\.(?:apng|avif|bmp|cur|gif|ico|jfif|jpe?g|pjp(?:eg)?|png|svg|tiff?|webp|woff2?|eot|ttf|otf|mp3|mp4|m4a|ogg|oga|opus|wav|flac|aac|webm|pdf|txt|wasm)$/i;
const IDENTIFIER_PREFIX = '__fastServeRequire';
const PACKAGE_VALUE_HELPER = '__fastServeRequireValue';

type RequiredKind = 'json' | 'module' | 'asset' | 'package' | 'external';

interface HoistedImport {
  readonly identifier: string;
  readonly specifier: string;
  readonly kind: RequiredKind;
}

interface RequireCall {
  readonly node: ESTree.CallExpression;
  readonly specifier: string;
}

export interface RewrittenModule {
  readonly code: string;
  readonly map: ReturnType<MagicString['generateMap']>;
}

export interface RequireRewrite {
  readonly rewritten: RewrittenModule | undefined;
  readonly skippedDynamicRequire: boolean;
}

export interface RequireResolution {
  readonly isPathAlias: (specifier: string) => boolean;
  readonly isExternalModule: (specifier: string) => boolean;
}

const LOCAL_ONLY: RequireResolution = { isPathAlias: () => false, isExternalModule: () => false };

export function requireImportsPlugin({ root, project, logger }: Pick<ServeContext, 'root' | 'project' | 'logger'>): Plugin {
  const resolution: RequireResolution = {
    isPathAlias: (specifier) => {
      const paths = project.tsconfigPaths();
      return paths !== undefined && matchesPathAlias(paths, specifier);
    },
    isExternalModule: (specifier) => project.libraries().has(specifier) || project.configExternals().has(specifier),
  };
  const warnedFiles = new Set<string>();
  return {
    name: 'fast-serve:require-imports',
    apply: 'serve',
    transform: {
      filter: { id: { include: PROJECT_SCRIPT_ID, exclude: NODE_MODULES_ID }, code: REQUIRE_CALL },
      handler(code, id) {
        if (!isProjectScript(root, id)) return null;
        const { rewritten, skippedDynamicRequire } = rewriteRequires(code, id, resolution);
        const file = toPosix(path.relative(root, withoutQuery(id)));
        if (skippedDynamicRequire && !warnedFiles.has(file)) {
          warnedFiles.add(file);
          logger.warn(
            `${file}: require() with a computed module name is left as is and reaches SharePoint's RequireJS in the browser. ` +
              "Use a string literal (require('pkg')) or import() for modules chosen at runtime.",
          );
        }
        return rewritten ?? null;
      },
    },
  };
}

export function rewriteRequires(code: string, id: string, resolution: RequireResolution = LOCAL_ONLY): RequireRewrite {
  const { program, errors } = parseSync(id, code, { lang: 'js', sourceType: 'module' });
  if (errors.length > 0) return { rewritten: undefined, skippedDynamicRequire: false };
  const { calls, skippedDynamicRequire } = findRequireCalls(program);
  const rewritable = calls.flatMap((call) => {
    const kind = requiredKind(call.specifier, resolution);
    return kind ? [{ ...call, kind }] : [];
  });
  if (rewritable.length === 0) return { rewritten: undefined, skippedDynamicRequire };

  const hoisted = new Map<string, HoistedImport>();
  const output = new MagicString(code);
  const valueHelper = uniqueIdentifier(code, PACKAGE_VALUE_HELPER);
  for (const { node, specifier, kind } of rewritable) {
    let entry = hoisted.get(specifier);
    if (!entry) {
      entry = { identifier: uniqueIdentifier(code, `${IDENTIFIER_PREFIX}${hoisted.size}`), specifier, kind };
      hoisted.set(specifier, entry);
    }
    output.overwrite(node.start, node.end, entry.kind === 'package' ? `${valueHelper}(${entry.identifier})` : entry.identifier);
  }
  const imports = [...hoisted.values()];
  const lines = [...imports.map(renderImport), ...(imports.some(({ kind }) => kind === 'package') ? [renderValueHelper(valueHelper)] : [])];
  insertAfterImports(output, program, lines.join('\n'));

  return {
    rewritten: { code: output.toString(), map: output.generateMap({ hires: 'boundary', source: id, includeContent: true }) },
    skippedDynamicRequire,
  };
}

function findRequireCalls(program: ESTree.Program): { calls: RequireCall[]; skippedDynamicRequire: boolean } {
  const calls: RequireCall[] = [];
  let skippedDynamicRequire = false;
  walkWithAncestors(program, (node: SyntaxNode, ancestors) => {
    if (!isRequireCall(node) || isShadowed('require', ancestors)) return;
    const specifier = requireSpecifier(node);
    if (specifier !== undefined) calls.push({ node, specifier });
    else if (isComputedRequire(node)) skippedDynamicRequire = true;
  });
  return { calls, skippedDynamicRequire };
}

function isRequireCall(node: SyntaxNode): node is ESTree.CallExpression {
  if (node.type !== 'CallExpression') return false;
  const { callee } = node as ESTree.CallExpression;
  return callee.type === 'Identifier' && callee.name === 'require';
}

function isComputedRequire(node: ESTree.CallExpression): boolean {
  const [argument, ...rest] = node.arguments;
  return argument !== undefined && rest.length === 0 && argument.type !== 'ArrayExpression' && argument.type !== 'SpreadElement';
}

function requireSpecifier(node: ESTree.CallExpression): string | undefined {
  const [argument, ...rest] = node.arguments;
  if (rest.length > 0 || argument === undefined) return undefined;
  if (argument.type === 'Literal' && typeof argument.value === 'string') return argument.value;
  if (argument.type === 'TemplateLiteral' && argument.expressions.length === 0) return argument.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

function requiredKind(specifier: string, { isPathAlias, isExternalModule }: RequireResolution): RequiredKind | undefined {
  const filePath = withoutQuery(specifier);
  if (RELATIVE_SPECIFIER.test(specifier) || isPathAlias(specifier)) return localKind(filePath);
  if (!isBareSpecifier(specifier)) return undefined;
  if (isExternalModule(specifier)) return 'external';
  if (filePath.endsWith('.json')) return 'json';
  if (isStyleRequest(filePath)) return 'module';
  if (PACKAGE_ASSET.test(filePath)) return 'asset';
  return 'package';
}

function localKind(filePath: string): RequiredKind {
  if (filePath.endsWith('.json')) return 'json';
  if (isScriptPath(filePath) || isStyleRequest(filePath)) return 'module';
  return 'asset';
}

function isBareSpecifier(specifier: string): boolean {
  return specifier !== '' && !specifier.startsWith('/') && !specifier.startsWith('\0') && !URL_SPECIFIER.test(specifier);
}

function isScriptPath(filePath: string): boolean {
  const fileName = filePath.slice(filePath.lastIndexOf('/') + 1);
  return SCRIPT_SPECIFIER.test(fileName) || !fileName.includes('.');
}

function renderImport({ identifier, specifier, kind }: HoistedImport): string {
  const source = JSON.stringify(kind === 'asset' ? withUrlQuery(specifier) : specifier);
  if (kind === 'module' || kind === 'package') return `import * as ${identifier} from ${source};`;
  if (kind === 'external') return `import { ${EXTERNAL_MODULE_EXPORT} as ${identifier} } from ${source};`;
  return `import ${identifier} from ${source};`;
}

function renderValueHelper(name: string): string {
  return (
    `function ${name}(namespace) { ` +
    'return Object.prototype.toString.call(namespace) === "[object Module]" || namespace.__esModule ? namespace : namespace.default; }'
  );
}

function insertAfterImports(output: MagicString, program: ESTree.Program, lines: string): void {
  const anchor = program.body.findLast((statement) => statement.type === 'ImportDeclaration') ?? lastLeadingDirective(program);
  if (anchor) output.appendLeft(anchor.end, `\n${lines}`);
  else output.prepend(`${lines}\n`);
}

function lastLeadingDirective(program: ESTree.Program): ESTree.Statement | undefined {
  let last: ESTree.Statement | undefined;
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') break;
    last = statement;
  }
  return last;
}

function withUrlQuery(specifier: string): string {
  return specifier + (specifier.includes('?') ? '&url' : '?url');
}

function uniqueIdentifier(code: string, base: string): string {
  let identifier = base;
  while (code.includes(identifier)) identifier += '_';
  return identifier;
}
