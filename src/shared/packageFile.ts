import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function packageFile(relativeUrl: string, base: string): string {
  const compiled = fileURLToPath(new URL(`${relativeUrl}.js`, base));
  return existsSync(compiled) ? compiled : fileURLToPath(new URL(`${relativeUrl}.ts`, base));
}
