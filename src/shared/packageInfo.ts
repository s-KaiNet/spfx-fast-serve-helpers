import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  name: string;
  version: string;
}

export const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const packageJson = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
) as PackageJson;

export const packageName = packageJson.name;
export const packageVersion = packageJson.version;
