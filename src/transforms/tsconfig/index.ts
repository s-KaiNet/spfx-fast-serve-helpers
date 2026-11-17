import { isDeepStrictEqual } from 'node:util';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import type { ServeContext } from '../../context.js';
import type { SpfxProject } from '../../project/index.js';
import { transformCompilerOptions, type TransformCompilerOptions } from './compilerOptions.js';

export { transformCompilerOptions, type TransformCompilerOptions } from './compilerOptions.js';

type OxcOptions = Exclude<UserConfig['oxc'], false | undefined>;

interface OxcTsconfigOptions {
  tsconfig: { compilerOptions: TransformCompilerOptions };
}

export function tsconfigTransformPlugin({ project }: ServeContext): Plugin {
  return {
    name: 'fast-serve:tsconfig-transform',
    config: () => ({ oxc: oxcTsconfigOptions(project) }),
  };
}

export function oxcTsconfigOptions(project: SpfxProject): OxcOptions & OxcTsconfigOptions {
  return { tsconfig: { compilerOptions: transformCompilerOptions(project.tsconfigCompilerOptions()) } };
}

export function tsconfigTransformChanged(server: ViteDevServer, project: SpfxProject): boolean {
  const applied = server.config.oxc === false ? undefined : (server.config.oxc as Partial<OxcTsconfigOptions>).tsconfig;
  return !isDeepStrictEqual(applied, oxcTsconfigOptions(project).tsconfig);
}
