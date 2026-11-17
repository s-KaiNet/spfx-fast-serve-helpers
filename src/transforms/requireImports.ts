import { MagicString } from 'magic-string';
import { parseSync, Visitor, type ESTree, type Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { matchesPathAlias } from '../project/index.js';
import { isStyleRequest } from '../utils/vite.js';
import { isProjectScript, NODE_MODULES_ID, PROJECT_SCRIPT_ID } from './projectSource.js';

const REQUIRE_CALL = /\brequire\s*\(/;
const RELATIVE_SPECIFIER = /^\.\.?\//;
const SCRIPT_SPECIFIER = /\.[cm]?[jt]sx?$/;
const IDENTIFIER_PREFIX = '__fastServeRequire';

type RequiredKind = 'json' | 'module' | 'asset';

interface HoistedImport {
  readonly identifier: string;
  readonly specifier: string;
  readonly kind: RequiredKind;
}

export interface RewrittenModule {
  readonly code: string;
  readonly map: ReturnType<MagicString['generateMap']>;
}

export type IsPathAlias = (specifier: string) => boolean;

const NO_PATH_ALIASES: IsPathAlias = () => false;

export function requireImportsPlugin({ root, project }: Pick<ServeContext, 'root' | 'project'>): Plugin {
  const isPathAlias: IsPathAlias = (specifier) => {
    const paths = project.tsconfigPaths();
    return paths !== undefined && matchesPathAlias(paths, specifier);
  };
  return {
    name: 'fast-serve:require-imports',
    apply: 'serve',
    transform: {
      filter: { id: { include: PROJECT_SCRIPT_ID, exclude: NODE_MODULES_ID }, code: REQUIRE_CALL },
      handler: (code, id) => (isProjectScript(root, id) ? rewriteLocalRequires(code, id, isPathAlias) : null),
    },
  };
}

export function rewriteLocalRequires(code: string, id: string, isPathAlias: IsPathAlias = NO_PATH_ALIASES): RewrittenModule | null {
  const { program, errors } = parseSync(id, code, { lang: 'js', sourceType: 'module' });
  if (errors.length > 0) return null;
  const calls = findLocalRequireCalls(program, isPathAlias);
  if (calls.length === 0) return null;

  const hoisted = new Map<string, HoistedImport>();
  const output = new MagicString(code);
  for (const { node, specifier } of calls) {
    let entry = hoisted.get(specifier);
    if (!entry) {
      entry = { identifier: uniqueIdentifier(code, hoisted.size), specifier, kind: requiredKind(specifier) };
      hoisted.set(specifier, entry);
    }
    output.overwrite(node.start, node.end, entry.identifier);
  }
  output.prepend([...hoisted.values()].map(renderImport).join('\n') + '\n');

  return { code: output.toString(), map: output.generateMap({ hires: 'boundary', source: id, includeContent: true }) };
}

function findLocalRequireCalls(program: ESTree.Program, isPathAlias: IsPathAlias): { node: ESTree.CallExpression; specifier: string }[] {
  const calls: { node: ESTree.CallExpression; specifier: string }[] = [];
  new Visitor({
    CallExpression(node) {
      const specifier = requireSpecifier(node);
      if (specifier !== undefined && (RELATIVE_SPECIFIER.test(specifier) || isPathAlias(specifier))) calls.push({ node, specifier });
    },
  }).visit(program);
  return calls;
}

function requireSpecifier(node: ESTree.CallExpression): string | undefined {
  const [argument, ...rest] = node.arguments;
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'require' || rest.length > 0) return undefined;
  if (argument?.type !== 'Literal' || typeof argument.value !== 'string') return undefined;
  return argument.value;
}

function requiredKind(specifier: string): RequiredKind {
  const path = specifier.split('?')[0] ?? specifier;
  if (path.endsWith('.json')) return 'json';
  if (isScriptPath(path) || isStyleRequest(path)) return 'module';
  return 'asset';
}

function isScriptPath(path: string): boolean {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  return SCRIPT_SPECIFIER.test(fileName) || !fileName.includes('.');
}

function renderImport({ identifier, specifier, kind }: HoistedImport): string {
  if (kind === 'module') return `import * as ${identifier} from ${JSON.stringify(specifier)};`;
  return `import ${identifier} from ${JSON.stringify(kind === 'asset' ? withUrlQuery(specifier) : specifier)};`;
}

function withUrlQuery(specifier: string): string {
  return specifier + (specifier.includes('?') ? '&url' : '?url');
}

function uniqueIdentifier(code: string, index: number): string {
  let identifier = `${IDENTIFIER_PREFIX}${index}`;
  while (code.includes(identifier)) identifier += '_';
  return identifier;
}
