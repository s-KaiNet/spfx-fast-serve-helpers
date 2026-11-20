import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type { Logger } from '../logger.js';
import { createProject, type ProjectOptions } from '../project/index.js';
import { compileOnce, type BuildContext, type CompileResult } from '../rspack/index.js';

export const COMPILE_FIXTURE = fileURLToPath(new URL('../../test/fixtures/compile', import.meta.url));
export const LIBRARY_FIXTURE = fileURLToPath(new URL('../../test/fixtures/library', import.meta.url));
export const LIBRARY_PACKAGE = '@contoso/corp-lib';
export const TEST_ORIGIN = 'https://localhost:4433';

export interface AmdModule {
  dependencies: string[];
  exports: Record<string, unknown>;
}

export class FakeBaseClientSideWebPart {
  public readonly context: string = 'fake';
}

export const fakeExternals: Record<string, unknown> = {
  '@microsoft/sp-core-library': { Version: { parse: (value: string) => `parsed ${value}` } },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart: FakeBaseClientSideWebPart },
  '@microsoft/microsoft-graph-client': { GraphClient: FakeBaseClientSideWebPart },
};

export function recordingContext(root: string, locale: string, messages: string[], projectOptions: ProjectOptions = {}): BuildContext {
  const logger: Logger = {
    info: (message) => messages.push(`info: ${message}`),
    warn: (message) => messages.push(`warn: ${message}`),
    error: (message) => messages.push(`error: ${message}`),
  };
  return { root, project: createProject(root, logger, projectOptions), options: { origin: TEST_ORIGIN, locale, overlay: true }, logger };
}

export function evaluateAmd(source: string, externals: Record<string, unknown> = fakeExternals, globals: Record<string, unknown> = {}): AmdModule {
  let captured: { dependencies: string[]; factory: (...args: unknown[]) => unknown } | undefined;
  const sandbox: Record<string, unknown> = {
    ...globals,
    define: (...args: unknown[]) => {
      const factory = args.at(-1) as (...args: unknown[]) => unknown;
      captured = { dependencies: Array.isArray(args[0]) ? (args[0] as string[]) : [], factory };
    },
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.setTimeout = () => 0;
  vm.runInNewContext(source, sandbox);
  if (!captured) throw new Error('the bundle did not call define()');
  const { dependencies, factory } = captured;
  const exports = factory(...dependencies.map((name) => externals[name])) as Record<string, unknown>;
  return { dependencies, exports };
}

const OWN_NODE_MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url));

export function packageDirectory(name: string): string {
  return realpathSync(path.join(OWN_NODE_MODULES, name));
}

export interface FixtureCopy {
  root: string;
  write(file: string, content: string | object): void;
  read(file: string): string;
  linkPackage(name: string): void;
  linkLocalPackage(name: string, packageRoot: string): void;
  compile(locale?: string, projectOptions?: ProjectOptions): Promise<{ result: CompileResult; messages: string[]; bundle: (name: string) => string }>;
  remove(): void;
}

export function copyCompileFixture(files: Record<string, string | object> = {}): FixtureCopy {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-compile-'));
  cpSync(COMPILE_FIXTURE, root, { recursive: true });
  const write = (file: string, content: string | object) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, undefined, 2));
  };
  for (const [file, content] of Object.entries(files)) write(file, content);
  return {
    root,
    write,
    read: (file) => readFileSync(path.join(root, file), 'utf8'),
    linkPackage(name) {
      const target = path.join(root, 'node_modules', name);
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(packageDirectory(name), target, 'dir');
    },
    linkLocalPackage(name, packageRoot) {
      linkLocalPackage(root, name, packageRoot);
    },
    async compile(locale = 'en-us', projectOptions = {}) {
      const messages: string[] = [];
      const outputPath = path.join(root, 'out');
      const result = await compileOnce(recordingContext(root, locale, messages, projectOptions), { outputPath });
      return { result, messages, bundle: (name) => readFileSync(path.join(outputPath, `${name}.js`), 'utf8') };
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export interface LibraryCopy {
  root: string;
  write(file: string, content: string | object): void;
  remove(): void;
}

export function copyLibraryFixture(files: Record<string, string | object> = {}): LibraryCopy {
  const workspace = mkdtempSync(path.join(tmpdir(), 'fast-serve-library-'));
  const root = path.join(workspace, 'corp-lib');
  cpSync(LIBRARY_FIXTURE, root, { recursive: true });
  const write = (file: string, content: string | object) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, undefined, 2));
  };
  for (const [file, content] of Object.entries(files)) write(file, content);
  return {
    root,
    write,
    remove() {
      rmSync(workspace, { recursive: true, force: true });
    },
  };
}

export function linkLocalPackage(projectRoot: string, name: string, packageRoot: string): void {
  const target = path.join(projectRoot, 'node_modules', name);
  mkdirSync(path.dirname(target), { recursive: true });
  symlinkSync(packageRoot, target, 'dir');
  const packageFile = path.join(projectRoot, 'package.json');
  const json = JSON.parse(readFileSync(packageFile, 'utf8')) as { dependencies?: Record<string, string> };
  json.dependencies = { ...json.dependencies, [name]: `file:${packageRoot}` };
  writeFileSync(packageFile, JSON.stringify(json, undefined, 2));
}
