import path from 'node:path';
import { COPILOT_COMPONENT_TYPE, findSourceFile, SOURCE_EXTENSIONS, type ComponentManifest, type SpfxComponent } from '../../../project/index.js';
import { isObject } from '../../../shared/guards.js';
import { toPosix } from '../../../shared/paths.js';
import type { ModuleExports } from './moduleExports.js';

const REFERENCE = /^\$([^:]+):(.+);$/;

export interface ManifestReference {
  readonly id: string;
  readonly target: string;
  readonly sourceFile: string | undefined;
  readonly exportName: string;
}

export interface ReferenceResolution {
  readonly root: string;
  readonly exportsOf: (file: string) => Promise<ModuleExports>;
  readonly warn: (message: string) => void;
}

export function parseManifestReference(root: string, manifestFile: string, value: unknown): ManifestReference | undefined {
  if (!isObject(value) || typeof value.id !== 'string') return undefined;
  const match = REFERENCE.exec(value.id);
  if (match === null) return undefined;
  const [, referencedPath = '', exportName = ''] = match;
  const target = toPosix(path.relative(root, path.resolve(path.dirname(manifestFile), referencedPath)));
  return { id: value.id, target, sourceFile: findSourceFile(root, target, SOURCE_EXTENSIONS), exportName };
}

export async function withResolvedPropertiesSchemas(component: SpfxComponent, resolution: ReferenceResolution): Promise<ComponentManifest> {
  const { manifest, manifestFile } = component;
  if (manifest.componentType !== COPILOT_COMPONENT_TYPE || !Array.isArray(manifest.tools)) return manifest;
  const tools = await Promise.all(
    (manifest.tools as unknown[]).map(async (tool) => {
      if (!isObject(tool)) return tool;
      const reference = parseManifestReference(resolution.root, manifestFile, tool.propertiesSchema);
      if (reference === undefined) return tool;
      const resolved = await resolveReference(reference, resolution);
      if ('value' in resolved) return withPropertiesSchema(tool, resolved.value);
      const toolName = typeof tool.name === 'string' ? tool.name : '?';
      resolution.warn(`${manifest.alias}: tool "${toolName}" propertiesSchema "${reference.id}" is not resolved, the debug manifest keeps the reference: ${resolved.problem}`);
      return tool;
    }),
  );
  return { ...manifest, tools };
}

async function resolveReference({ target, sourceFile, exportName }: ManifestReference, { root, exportsOf }: ReferenceResolution): Promise<{ value: unknown } | { problem: string }> {
  if (sourceFile === undefined) return { problem: `${target} has no source under src/ and does not exist` };
  const evaluated = await exportsOf(sourceFile);
  const sourceName = toPosix(path.relative(root, sourceFile));
  if ('error' in evaluated) return { problem: `${sourceName} failed to evaluate: ${evaluated.error}` };
  const exported = evaluated.exports[exportName];
  if (exported === undefined) {
    return { problem: `export "${exportName}" not found in ${sourceName}; available exports: ${Object.keys(evaluated.exports).join(', ') || 'none'}` };
  }
  return { value: toJsonValue(exported) };
}

function toJsonValue(exported: unknown): unknown {
  if (isObject(exported) && typeof exported.toJSON === 'function') return (exported.toJSON as () => unknown)();
  if (typeof exported === 'object' && exported !== null) return exported;
  return { value: exported };
}

function withPropertiesSchema(tool: Record<string, unknown>, propertiesSchema: unknown): Record<string, unknown> {
  return { ...tool, propertiesSchema };
}
