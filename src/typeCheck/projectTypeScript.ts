import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveFromProject } from '../utils/heftProject.js';

export const TSCONFIG_FILE = 'tsconfig.json';
const FIRST_UNSUPPORTED_MAJOR = 7;

export type ProjectTypeScript = { found: true; path: string; version: string } | { found: false; reason: string };

export function findProjectTypeScript(root: string): ProjectTypeScript {
  if (!existsSync(path.join(root, TSCONFIG_FILE))) return { found: false, reason: `the project has no ${TSCONFIG_FILE}` };
  const packageFile = resolveFromProject(root, 'typescript/package.json');
  if (packageFile === undefined) return { found: false, reason: 'TypeScript was not found in the project or its SPFx build rig (reinstall the project dependencies)' };
  const { version, main } = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string; main?: string };
  const major = Number.parseInt(version ?? '', 10);
  if (version === undefined || Number.isNaN(major)) return { found: false, reason: `${packageFile} has no version` };
  if (major >= FIRST_UNSUPPORTED_MAJOR) return { found: false, reason: `the project's TypeScript ${version} has no compiler API for the checker (SPFx builds with TypeScript 5)` };
  const compiler = path.join(path.dirname(packageFile), main ?? 'lib/typescript.js');
  if (!existsSync(compiler)) return { found: false, reason: `the project's TypeScript ${version} is incomplete (${compiler} is missing)` };
  return { found: true, path: compiler, version };
}
