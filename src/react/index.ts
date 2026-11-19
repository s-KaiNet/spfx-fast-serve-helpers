import { createRequire } from 'node:module';
import path from 'node:path';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';

export const REACT_REQUESTS = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'];

export function reactContribution({ root }: BuildContext): ConfigContribution {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  const alias: Record<string, string> = {};
  for (const request of REACT_REQUESTS) {
    const file = tryResolve(projectRequire, request);
    if (file !== undefined) alias[`${request}$`] = file;
  }
  return { alias };
}

function tryResolve(projectRequire: NodeJS.Require, request: string): string | undefined {
  try {
    return projectRequire.resolve(request);
  } catch {
    return undefined;
  }
}
