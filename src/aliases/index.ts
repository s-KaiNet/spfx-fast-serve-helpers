import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { aliasCandidates } from '../project/index.js';
import { isProjectScript } from '../transforms/projectSource.js';
import { withoutQuery } from '../utils/vite.js';

export function tsconfigPathsPlugin({ root, project }: ServeContext): Plugin {
  return {
    name: 'fast-serve:tsconfig-paths',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !isProjectScript(root, withoutQuery(importer))) return null;
      const paths = project.tsconfigPaths();
      if (!paths) return null;
      const queryStart = source.indexOf('?');
      const specifier = queryStart === -1 ? source : source.slice(0, queryStart);
      const query = queryStart === -1 ? '' : source.slice(queryStart);
      return firstResolved(aliasCandidates(paths, specifier), async (candidate) => {
        const resolved = await this.resolve(candidate + query, importer, { ...options, skipSelf: true });
        return resolved && !resolved.external ? resolved : null;
      });
    },
  };
}

async function firstResolved<T>(candidates: readonly string[], resolveCandidate: (candidate: string) => Promise<T | null>): Promise<T | null> {
  const [candidate, ...rest] = candidates;
  if (candidate === undefined) return null;
  return (await resolveCandidate(candidate)) ?? firstResolved(rest, resolveCandidate);
}
