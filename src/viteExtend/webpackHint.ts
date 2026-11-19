import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageName } from '../packageInfo.js';
import { findWebpackCustomizations } from '../project/index.js';
import { toPosix } from '../utils/paths.js';
import { VITE_EXTEND_FILE } from './files.js';

export const SKILL_PATH = 'skills/fast-serve-vite-config/SKILL.md';
export const VITE_CONFIG_DOCS_URL = 'https://github.com/s-KaiNet/spfx-fast-serve-helpers#customizing-the-vite-config';
const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function webpackCustomizationHint(root: string, packageRoot: string = PACKAGE_ROOT): string[] {
  const customizations = findWebpackCustomizations(root);
  if (customizations.length === 0) return [];
  const skill = skillLocation(root, packageRoot);
  return [
    `hint: this project customizes heft's webpack config (${customizations.join(', ')}), but fast-serve doesn't run webpack.`,
    `  if those customizations matter in development (DefinePlugin constants, aliases, loaders), mirror them in ${VITE_EXTEND_FILE}:`,
    '  a Vite config that fast-serve merges into its own and reloads on change, for example:',
    `    import { defineConfig } from '${packageName}';`,
    "    export default defineConfig(({ root }) => ({ define: { MY_CONSTANT: JSON.stringify('value') } }));",
    `  docs: ${VITE_CONFIG_DOCS_URL}`,
    `  coding agents: ${skill}`,
    `  to make a project's coding agent use it, add to its AGENTS.md: "For fast-serve's Vite config (${VITE_EXTEND_FILE}) follow ${skill}"`,
    `  nothing to mirror? add ${VITE_EXTEND_FILE} with "export default {};" to hide this hint`,
  ];
}

function skillLocation(root: string, packageRoot: string): string {
  const installed = path.join(root, 'node_modules', packageName, SKILL_PATH);
  if (existsSync(installed)) return toPosix(path.relative(root, installed));
  return toPosix(path.join(packageRoot, SKILL_PATH));
}
