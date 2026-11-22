import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveFromProject } from '../project/heft/heftProject.js';

export const ESLINT_CONFIG_FILES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'];
const FIRST_SUPPORTED_MAJOR = 9;

export type ProjectEslint = { found: true; eslintPath: string; version: string; configFile: string } | { found: false; reason: string };

export function findProjectEslint(root: string): ProjectEslint {
  const configFile = ESLINT_CONFIG_FILES.map((name) => path.join(root, name)).find((file) => existsSync(file));
  if (configFile === undefined) return { found: false, reason: `no ${ESLINT_CONFIG_FILES.join(' / ')}` };
  const packageFile = resolveFromProject(root, 'eslint/package.json');
  if (packageFile === undefined) return { found: false, reason: 'ESLint is not installed in the project' };
  const { version } = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: string };
  const major = Number.parseInt(version ?? '', 10);
  if (version === undefined || Number.isNaN(major)) return { found: false, reason: `${packageFile} has no version` };
  if (major < FIRST_SUPPORTED_MAJOR) return { found: false, reason: `the project's ESLint ${version} is older than ${FIRST_SUPPORTED_MAJOR} (flat config)` };
  const eslintPath = resolveFromProject(root, 'eslint');
  if (eslintPath === undefined) return { found: false, reason: `the project's ESLint ${version} has no entry point` };
  return { found: true, eslintPath, version, configFile };
}
