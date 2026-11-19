import type { ESTree } from 'vite';

export interface SyntaxNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

type NodeRecord = SyntaxNode & Readonly<Record<string, unknown>>;

export type AncestorVisitor = (node: SyntaxNode, ancestors: readonly SyntaxNode[]) => void;

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const BLOCK_TYPES = new Set(['BlockStatement', 'StaticBlock']);
const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement']);

export function walkWithAncestors(program: ESTree.Program, visit: AncestorVisitor): void {
  const ancestors: SyntaxNode[] = [];
  const walk = (node: SyntaxNode): void => {
    visit(node, ancestors);
    ancestors.push(node);
    for (const child of childNodes(node)) walk(child);
    ancestors.pop();
  };
  walk(program);
}

export function isShadowed(name: string, ancestors: readonly SyntaxNode[]): boolean {
  return ancestors.some((scope) => declaresInScope(scope as NodeRecord, name));
}

function declaresInScope(scope: NodeRecord, name: string): boolean {
  if (scope.type === 'Program') return hoistedNames(scope.body).has(name) || lexicalNames(scope.body).has(name);
  if (FUNCTION_TYPES.has(scope.type)) {
    if (scope.type === 'FunctionExpression' && bindingName(scope.id) === name) return true;
    if (asNodes(scope.params).some((param) => patternNames(param).includes(name))) return true;
    const body = scope.body as NodeRecord | undefined;
    return body?.type === 'BlockStatement' && hoistedNames(body.body).has(name);
  }
  if (BLOCK_TYPES.has(scope.type)) return lexicalNames(scope.body).has(name);
  if (scope.type === 'SwitchStatement') return lexicalNames(asNodes(scope.cases).flatMap((switchCase) => asNodes(switchCase.consequent))).has(name);
  if (LOOP_TYPES.has(scope.type)) return [scope.init, scope.left].some((head) => isLexicalDeclaration(head) && declarationNames(head).includes(name));
  if (scope.type === 'CatchClause') return scope.param !== null && patternNames(scope.param).includes(name);
  if (scope.type === 'ClassExpression') return bindingName(scope.id) === name;
  return false;
}

function hoistedNames(statements: unknown): Set<string> {
  const names = new Set<string>();
  const collect = (node: NodeRecord): void => {
    if (FUNCTION_TYPES.has(node.type)) return;
    if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const declared of declarationNames(node)) names.add(declared);
    for (const child of childNodes(node)) collect(child as NodeRecord);
  };
  for (const statement of asNodes(statements)) collect(statement);
  return names;
}

function lexicalNames(statements: unknown): Set<string> {
  const names = new Set<string>();
  for (const statement of asNodes(statements).map(unwrapExport)) {
    if (statement.type === 'ImportDeclaration') for (const specifier of asNodes(statement.specifiers)) names.add(bindingName(specifier.local) ?? '');
    else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') names.add(bindingName(statement.id) ?? '');
    else if (isLexicalDeclaration(statement)) for (const declared of declarationNames(statement)) names.add(declared);
  }
  return names;
}

function unwrapExport(statement: NodeRecord): NodeRecord {
  const isExport = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration';
  const declaration = statement.declaration as NodeRecord | null | undefined;
  return isExport && declaration ? declaration : statement;
}

function isLexicalDeclaration(node: unknown): node is NodeRecord {
  return isNode(node) && node.type === 'VariableDeclaration' && node.kind !== 'var';
}

function declarationNames(declaration: NodeRecord): string[] {
  return asNodes(declaration.declarations).flatMap((declarator) => patternNames(declarator.id));
}

function patternNames(pattern: unknown): string[] {
  if (!isNode(pattern)) return [];
  switch (pattern.type) {
    case 'Identifier':
      return [String(pattern.name)];
    case 'ObjectPattern':
      return asNodes(pattern.properties).flatMap((property) => patternNames(property.type === 'RestElement' ? property.argument : property.value));
    case 'ArrayPattern':
      return asNodes(pattern.elements).flatMap(patternNames);
    case 'AssignmentPattern':
      return patternNames(pattern.left);
    case 'RestElement':
      return patternNames(pattern.argument);
    default:
      return [];
  }
}

function bindingName(node: unknown): string | undefined {
  return isNode(node) && node.type === 'Identifier' ? String(node.name) : undefined;
}

function childNodes(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) children.push(...value.filter(isNode));
    else if (isNode(value)) children.push(value);
  }
  return children;
}

function asNodes(value: unknown): NodeRecord[] {
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is NodeRecord {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
