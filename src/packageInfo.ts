import { readFileSync } from 'node:fs';

interface PackageJson {
  name: string;
  version: string;
}

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;

export const packageName = packageJson.name;
export const packageVersion = packageJson.version;
