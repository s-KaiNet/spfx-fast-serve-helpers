import { readFileSync } from 'node:fs';

interface PackageJson {
  name: string;
  version: string;
}

// Works from both src/ (tests) and lib/ (built): package.json is one level up.
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;

export const packageName = packageJson.name;
export const packageVersion = packageJson.version;
