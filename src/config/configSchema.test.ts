import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Ajv } from 'ajv';
import { describe, expect, it, onTestFinished } from 'vitest';
import { loadOptionsFile, OPTION_NAMES, OPTIONS_FILE, OPTIONS_SCHEMA_PATH } from './options.js';
import { repoPath } from '../../test/kit/paths.js';

const packageRoot = repoPath();
const schemaFile = path.join(packageRoot, 'schema', 'config.schema.json');
const schema: unknown = JSON.parse(readFileSync(schemaFile, 'utf8'));

interface ObjectSchema {
  $schema: string;
  properties: Record<string, unknown>;
  additionalProperties: boolean;
}

function isObjectSchema(value: unknown): value is ObjectSchema {
  return typeof value === 'object' && value !== null && 'properties' in value && 'additionalProperties' in value;
}

function objectSchema(): ObjectSchema {
  if (!isObjectSchema(schema)) throw new Error('schema/config.schema.json is not an object schema');
  return schema;
}

const validate = new Ajv({ strict: true, allErrors: true }).compile(objectSchema());

function loadConfig(config: Record<string, unknown>): ReturnType<typeof loadOptionsFile> {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-schema-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(path.join(root, path.dirname(OPTIONS_FILE)));
  writeFileSync(path.join(root, OPTIONS_FILE), JSON.stringify(config));
  return loadOptionsFile(root);
}

const validConfig = {
  $schema: OPTIONS_SCHEMA_PATH,
  port: 4321,
  pageUrl: 'https://{tenantDomain}/sites/dev/SitePages/Test.aspx',
  locale: 'en-us',
  serveConfiguration: 'default',
  overlay: true,
  deployedLibraries: ['@contoso/corp-lib'],
  typeCheck: true,
  typeCheckOverlay: false,
  lint: true,
};

describe('schema/config.schema.json', () => {
  it('is a draft-07 schema that lists exactly the options fast-serve reads, plus $schema', () => {
    const { $schema, properties, additionalProperties } = objectSchema();
    expect($schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(additionalProperties).toBe(false);
    expect(Object.keys(properties).filter((name) => name !== '$schema').toSorted()).toEqual(OPTION_NAMES.toSorted());
    expect(properties).toHaveProperty('$schema');
  });

  it('is shipped in the package at the path the docs and warnings use', () => {
    const packageJson: unknown = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    expect(packageJson).toHaveProperty('name', 'spfx-fast-serve-helpers');
    expect(packageJson).toHaveProperty('files', expect.arrayContaining<string>(['schema']));
    const fromConfigFolder = path.resolve(packageRoot, 'fast-serve', OPTIONS_SCHEMA_PATH);
    expect(fromConfigFolder.endsWith(path.join('node_modules', 'spfx-fast-serve-helpers', 'schema', 'config.schema.json'))).toBe(true);
  });

  it('accepts a full valid config that fast-serve also reads', () => {
    expect(validate(validConfig)).toBe(true);
    expect(validate.errors).toBeNull();
    expect(loadConfig(validConfig)).toEqual({ ...validConfig, $schema: undefined });
    expect(validate({})).toBe(true);
  });

  it('accepts lint "full" and rejects other lint strings, like fast-serve', () => {
    expect(validate({ lint: 'full' })).toBe(true);
    expect(loadConfig({ lint: 'full' })).toEqual({ lint: 'full' });
    expect(validate({ lint: 'fast' })).toBe(false);
    expect(() => loadConfig({ lint: 'fast' })).toThrow(/"lint"/);
  });

  it('rejects a typo in a key, like fast-serve', () => {
    expect(validate({ typecheck: false })).toBe(false);
    expect(validate.errors).toEqual([expect.objectContaining({ keyword: 'additionalProperties', params: { additionalProperty: 'typecheck' } })]);
    expect(() => loadConfig({ typecheck: false })).toThrow(/unknown option.*"typecheck"/);
  });

  it('rejects wrong types, like fast-serve', () => {
    for (const config of [{ port: '4321' }, { overlay: 'no' }, { deployedLibraries: '@contoso/corp-lib' }, { typeCheckOverlay: 1 }]) {
      expect(validate(config)).toBe(false);
      expect(() => loadConfig(config)).toThrow(/wrong type/);
    }
  });

  it('describes every option with its default or the flag that overrides it', () => {
    for (const name of OPTION_NAMES) {
      expect(objectSchema().properties[name]).toHaveProperty('description', expect.stringMatching(/Default: .+\./));
    }
  });
});
