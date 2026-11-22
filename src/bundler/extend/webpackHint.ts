import { existsSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, packageName } from '../../shared/packageInfo.js';
import { findWebpackCustomizations } from '../../project/index.js';
import { toPosix } from '../../shared/paths.js';
import { EXTEND_FILE } from './files.js';

export const SKILL_PATH = 'skills/fast-serve-rspack-config/SKILL.md';
export const RSPACK_CONFIG_DOCS_URL = 'https://github.com/s-KaiNet/spfx-fast-serve-helpers#customizing-the-rspack-config';

export function webpackCustomizationHint(root: string, packageRoot: string = PACKAGE_ROOT): string[] {
  const customizations = findWebpackCustomizations(root);
  if (customizations.length === 0) return [];
  const skill = skillLocation(root, packageRoot);
  return [
    `hint: this project customizes heft's webpack config (${customizations.join(', ')}), but fast-serve builds its own Rspack config and doesn't run it.`,
    `  if those customizations matter in development (DefinePlugin constants, aliases, loaders), mirror them in ${EXTEND_FILE}:`,
    '  a Rspack config that fast-serve merges into its own and restarts on change; most webpack settings translate almost 1:1, for example:',
    `    import { defineConfig, rspack } from '${packageName}';`,
    "    export default defineConfig(({ root }) => ({ plugins: [new rspack.DefinePlugin({ MY_CONSTANT: JSON.stringify('value') })] }));",
    `  docs: ${RSPACK_CONFIG_DOCS_URL}`,
    `  coding agents: ${skill}`,
    `  to make a project's coding agent use it, add to its AGENTS.md: "For fast-serve's Rspack config (${EXTEND_FILE}) follow ${skill}"`,
    `  nothing to mirror? add ${EXTEND_FILE} with "export default {};" to hide this hint`,
  ];
}

function skillLocation(root: string, packageRoot: string): string {
  const installed = path.join(root, 'node_modules', packageName, SKILL_PATH);
  if (existsSync(installed)) return toPosix(path.relative(root, installed));
  return toPosix(path.join(packageRoot, SKILL_PATH));
}
