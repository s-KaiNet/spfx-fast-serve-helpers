import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageDirectory } from '../../../../test/kit/compileKit.js';
import type { FeatureContext } from '../../../bundler/featureApi/index.js';
import { typeCheckFeature } from './index.js';
import { findProjectTypeScript, type ProjectTypeScript } from './projectTypeScript.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project({ tsconfig = true, typescript }: { tsconfig?: boolean; typescript?: string } = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-typescript-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), '{ "name": "contoso-web-parts", "version": "1.0.0" }');
  if (tsconfig) writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  if (typescript !== undefined) {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(packageDirectory(typescript), path.join(root, 'node_modules', 'typescript'), 'dir');
  }
  return root;
}

function reasonOff(result: ProjectTypeScript): string {
  return result.found ? 'found' : result.reason;
}

describe('the project TypeScript for type checking', () => {
  it('uses the TypeScript 5 compiler the project depends on', () => {
    const found = findProjectTypeScript(project({ typescript: 'typescript-5' }));
    expect(found).toEqual({ found: true, version: '5.8.3', path: path.join(packageDirectory('typescript-5'), 'lib', 'typescript.js') });
  });

  it('turns type checking off without a tsconfig.json', () => {
    expect(findProjectTypeScript(project({ tsconfig: false, typescript: 'typescript-5' }))).toEqual({ found: false, reason: 'the project has no tsconfig.json', level: 'info' });
  });

  it('turns type checking off when the project TypeScript is incomplete', () => {
    const root = project();
    mkdirSync(path.join(root, 'node_modules', 'typescript'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', 'typescript', 'package.json'), '{ "name": "typescript", "version": "5.8.3", "main": "./lib/typescript.js" }');
    expect(reasonOff(findProjectTypeScript(root))).toContain("the project's TypeScript 5.8.3 is incomplete");
  });

  it('turns type checking off for TypeScript 7, which has no compiler API', () => {
    expect(reasonOff(findProjectTypeScript(project({ typescript: 'typescript' })))).toMatch(/TypeScript 7\.\S+ has no compiler API/);
  });

  it('starts without a type check and one info line when the project has no tsconfig.json', async () => {
    const messages: string[] = [];
    const logger = { info: (message: string) => messages.push(`info: ${message}`), warn: (message: string) => messages.push(`warn: ${message}`), error: (message: string) => messages.push(`error: ${message}`) };
    const context = { root: project({ tsconfig: false }), logger, options: { origin: 'https://localhost:4488', locale: 'en-us', overlay: true, typeCheck: true, typeCheckOverlay: true } } as unknown as FeatureContext;
    expect(await typeCheckFeature.contribute(context)).toEqual({});
    expect(messages).toEqual(['info: type check is off: the project has no tsconfig.json']);
  });
});
