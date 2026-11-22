import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SpfxComponent } from '../../../project/index.js';
import { parseManifestReference, withResolvedPropertiesSchemas, type ReferenceResolution } from './manifestReferences.js';
import type { ModuleExports } from './moduleExports.js';

const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-references-'));
const manifestFile = path.join(root, 'src/copilotComponents/links/LinksCopilotComponent.manifest.json');
const propertiesSource = path.join(root, 'src/copilotComponents/links/LinksProperties.ts');
mkdirSync(path.dirname(propertiesSource), { recursive: true });
writeFileSync(propertiesSource, 'export default {};\n');

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const SCHEMA_REFERENCE = '$../../../lib/copilotComponents/links/LinksProperties.js:default;';

function copilotComponent(tools: unknown[], componentType = 'CopilotComponent'): SpfxComponent {
  return {
    bundleName: 'links',
    manifestFile,
    entryFile: path.join(root, 'src/copilotComponents/links/LinksCopilotComponent.ts'),
    manifest: { id: 'c1', alias: 'LinksCopilotComponent', componentType, version: '1.0.0', tools },
  };
}

function resolution(exportsOf: (file: string) => ModuleExports): ReferenceResolution & { warnings: string[]; files: string[] } {
  const warnings: string[] = [];
  const files: string[] = [];
  return {
    root,
    warnings,
    files,
    exportsOf: (file) => {
      files.push(file);
      return Promise.resolve(exportsOf(file));
    },
    warn: (message) => warnings.push(message),
  };
}

describe('parseManifestReference', () => {
  it('reads heft\'s $<path>:<export>; form relative to the manifest and maps lib/ to the source under src/', () => {
    expect(parseManifestReference(root, manifestFile, { id: SCHEMA_REFERENCE })).toEqual({
      id: SCHEMA_REFERENCE,
      target: 'lib/copilotComponents/links/LinksProperties.js',
      sourceFile: propertiesSource,
      exportName: 'default',
    });
  });

  it('ignores values that are not references', () => {
    expect(parseManifestReference(root, manifestFile, { type: 'object' })).toBeUndefined();
    expect(parseManifestReference(root, manifestFile, { id: 'plain' })).toBeUndefined();
    expect(parseManifestReference(root, manifestFile, '$a.js:default;')).toBeUndefined();
  });
});

describe('withResolvedPropertiesSchemas', () => {
  const schema = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { message: { type: 'string' } } };

  it('inlines the evaluated export as the tool\'s propertiesSchema and keeps inline schemas', async () => {
    const resolver = resolution(() => ({ exports: { default: schema } }));
    const inline = { name: 'InlineTool', propertiesSchema: { type: 'object' } };
    const manifest = await withResolvedPropertiesSchemas(copilotComponent([{ name: 'LinksTool', propertiesSchema: { id: SCHEMA_REFERENCE } }, inline]), resolver);
    expect(manifest.tools).toEqual([{ name: 'LinksTool', propertiesSchema: schema }, inline]);
    expect(resolver.files).toEqual([propertiesSource]);
    expect(resolver.warnings).toEqual([]);
  });

  it('converts values like heft: toJSON() is honoured and primitives are wrapped', async () => {
    const withToJson = await withResolvedPropertiesSchemas(
      copilotComponent([{ name: 'A', propertiesSchema: { id: SCHEMA_REFERENCE } }]),
      resolution(() => ({ exports: { default: { toJSON: () => ({ type: 'string' }) } } })),
    );
    expect(withToJson.tools).toEqual([{ name: 'A', propertiesSchema: { type: 'string' } }]);
    const primitive = await withResolvedPropertiesSchemas(copilotComponent([{ name: 'A', propertiesSchema: { id: SCHEMA_REFERENCE } }]), resolution(() => ({ exports: { default: 7 } })));
    expect(primitive.tools).toEqual([{ name: 'A', propertiesSchema: { value: 7 } }]);
  });

  it('keeps the reference and warns when the module fails, the export is missing or the file does not exist', async () => {
    const failing = resolution(() => ({ error: 'boom' }));
    const tools = [{ name: 'LinksTool', propertiesSchema: { id: SCHEMA_REFERENCE } }];
    expect((await withResolvedPropertiesSchemas(copilotComponent(tools), failing)).tools).toEqual(tools);
    expect(failing.warnings).toEqual([
      `LinksCopilotComponent: tool "LinksTool" propertiesSchema "${SCHEMA_REFERENCE}" is not resolved, the debug manifest keeps the reference: src/copilotComponents/links/LinksProperties.ts failed to evaluate: boom`,
    ]);
    const missingExport = resolution(() => ({ exports: { schema: {} } }));
    await withResolvedPropertiesSchemas(copilotComponent(tools), missingExport);
    expect(missingExport.warnings[0]).toMatch(/export "default" not found in src\/copilotComponents\/links\/LinksProperties\.ts; available exports: schema$/);
    const missingFile = resolution(() => ({ exports: {} }));
    await withResolvedPropertiesSchemas(copilotComponent([{ name: 'X', propertiesSchema: { id: '$./Missing.js:default;' } }]), missingFile);
    expect(missingFile.warnings[0]).toMatch(/src\/copilotComponents\/links\/Missing\.js has no source under src\/ and does not exist$/);
    expect(missingFile.files).toEqual([]);
  });

  it('leaves other component types alone', async () => {
    const resolver = resolution(() => ({ exports: { default: schema } }));
    const tools = [{ name: 'LinksTool', propertiesSchema: { id: SCHEMA_REFERENCE } }];
    expect((await withResolvedPropertiesSchemas(copilotComponent(tools, 'WebPart'), resolver)).tools).toEqual(tools);
    expect(resolver.files).toEqual([]);
  });
});
