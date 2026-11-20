import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Compiler, RspackPluginInstance, RuleSetCondition, RuleSetRule } from '@rspack/core';
import { globSync } from 'tinyglobby';
import { packageFile } from '../../utils/packageFile.js';
import { isInside } from '../../utils/paths.js';
import type { ConstEnumCheck } from './constEnumLoader.js';
import { exportedConstEnums, globalConstEnums, referencedGlobals } from './declarations.js';
import { formatAmbientEnumMessage, formatDeclarationImportMessage } from './message.js';

const PLUGIN_NAME = 'fast-serve:const-enums';
const SCRIPT_EXTENSION = /\.[cm]?[jt]sx?$/;
const MODULE_NOT_FOUND = /Can't resolve '(\.\.?(?:\/[^']*)?)'/;

export function findDeclarationOnlyModule(target: string): string | undefined {
  const base = target.replace(SCRIPT_EXTENSION, '');
  return [`${base}.d.ts`, path.join(target, 'index.d.ts')].find((candidate) => existsSync(candidate));
}

export class AmbientConstEnums {
  readonly #sourceFolder: string;
  #byName = new Map<string, string>();

  constructor(sourceFolder: string) {
    this.#sourceFolder = sourceFolder;
  }

  rescan(): void {
    const files = existsSync(this.#sourceFolder) ? globSync('**/*.d.{ts,mts,cts}', { cwd: this.#sourceFolder, absolute: true, ignore: ['**/node_modules/**'] }) : [];
    this.#byName = new Map(files.flatMap((file) => readGlobalConstEnums(file).map((name) => [name, path.normalize(file)] as const)));
  }

  get declarations(): ReadonlyMap<string, string> {
    return this.#byName;
  }
}

function readGlobalConstEnums(file: string): string[] {
  try {
    return globalConstEnums(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

export function ambientEnumCheck(displayRoot: string, ambientEnums: AmbientConstEnums): ConstEnumCheck {
  return (code, file) => {
    const declarations = ambientEnums.declarations;
    if (declarations.size === 0) return undefined;
    const uses = referencedGlobals(code, [...declarations.keys()]).map((name) => ({ name, declarationFile: declarations.get(name) ?? '' }));
    return uses.length === 0 ? undefined : formatAmbientEnumMessage(displayRoot, file, uses);
  };
}

export function constEnumCheckRule(root: string, ambientEnums: AmbientConstEnums, exclude: RuleSetCondition, displayRoot: string = root): RuleSetRule {
  return {
    test: /\.tsx?$/,
    include: root,
    exclude,
    enforce: 'post',
    loader: packageFile('./constEnumLoader', import.meta.url),
    options: { check: ambientEnumCheck(displayRoot, ambientEnums) },
  };
}

export class ConstEnumsPlugin implements RspackPluginInstance {
  readonly #root: string;
  readonly #ambientEnums: AmbientConstEnums;
  readonly #displayRoot: string;

  constructor(root: string, ambientEnums: AmbientConstEnums, displayRoot: string = root) {
    this.#root = root;
    this.#ambientEnums = ambientEnums;
    this.#displayRoot = displayRoot;
  }

  apply(compiler: Compiler): void {
    const rescan = () => {
      this.#ambientEnums.rescan();
    };
    compiler.hooks.beforeRun.tap(PLUGIN_NAME, rescan);
    compiler.hooks.watchRun.tap(PLUGIN_NAME, rescan);
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.afterSeal.tapPromise(PLUGIN_NAME, () => {
        compilation.errors = compilation.errors.map((error) => {
          const importer = error.module?.nameForCondition();
          const request = MODULE_NOT_FOUND.exec(error.message)?.[1];
          if (importer === undefined || request === undefined || !isInside(this.#root, importer)) return error;
          const declarationFile = findDeclarationOnlyModule(path.resolve(path.dirname(importer), request));
          if (declarationFile === undefined) return error;
          const message = formatDeclarationImportMessage(this.#displayRoot, importer, request, declarationFile, exportedConstEnums(readFileSync(declarationFile, 'utf8')));
          return Object.assign(new compiler.webpack.WebpackError(message), { module: error.module });
        });
        return Promise.resolve();
      });
    });
  }
}
