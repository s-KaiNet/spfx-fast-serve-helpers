import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tsc = path.join(repoRoot, 'node_modules/.bin/tsc');
let projectRoot: string;

const validConfig = `import path from 'node:path';
import { defineConfig, rspack, type FastServeContext, type RspackPluginInstance } from 'spfx-fast-serve-helpers';

const headers: RspackPluginInstance = {
  apply(compiler) {
    compiler.hooks.done.tap('contoso', (stats) => {
      console.log(stats.hasErrors());
    });
  },
};

const describeContext = (context: FastServeContext): string => \`\${context.origin} \${context.publicPath} \${context.spfxVersion} \${context.rspackVersion}\`;

export default defineConfig(async ({ root, port, serveConfiguration, pageUrl }, env) => ({
  plugins: [new rspack.DefinePlugin({ CONTOSO_API: JSON.stringify([describeContext, port, serveConfiguration ?? '', pageUrl ?? '', env.command]) }), headers],
  resolve: { alias: { '@src': path.join(root, 'src') } },
  module: { rules: [{ test: /\\.txt$/, type: 'asset/source' }] },
  devServer: { proxy: [{ context: ['/api'], target: 'https://api.contoso.com' }] },
}));
`;

const invalidConfig = `import { defineConfig } from 'spfx-fast-serve-helpers';

export default defineConfig(({ port }) => ({ name: port.toUpperCase() }));
`;

function writeTsconfig(name: string, file: string): void {
  writeFileSync(
    path.join(projectRoot, name),
    JSON.stringify({ compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022', strict: true, noEmit: true, skipLibCheck: true, types: ['node'] }, files: [file] }),
  );
}

function typecheck(tsconfig: string): { ok: boolean; output: string } {
  try {
    execFileSync(tsc, ['-p', path.join(projectRoot, tsconfig)], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: String((error as { stdout?: string }).stdout ?? error) };
  }
}

beforeAll(() => {
  projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-public-api-'));
  const installed = path.join(projectRoot, 'node_modules/spfx-fast-serve-helpers');
  mkdirSync(path.join(installed, 'node_modules'), { recursive: true });
  mkdirSync(path.join(projectRoot, 'node_modules/@types'), { recursive: true });
  copyFileSync(path.join(repoRoot, 'package.json'), path.join(installed, 'package.json'));
  execFileSync(tsc, ['-p', path.join(repoRoot, 'tsconfig.types.json'), '--outDir', path.join(installed, 'lib')], { stdio: 'pipe' });
  mkdirSync(path.join(installed, 'node_modules/@rspack'), { recursive: true });
  symlinkSync(path.join(repoRoot, 'node_modules/@rspack/core'), path.join(installed, 'node_modules/@rspack/core'), 'junction');
  symlinkSync(path.join(repoRoot, 'node_modules/@types/node'), path.join(projectRoot, 'node_modules/@types/node'), 'junction');
  mkdirSync(path.join(projectRoot, 'fast-serve'));
  writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'spfx-project', private: true }));
  writeFileSync(path.join(projectRoot, 'fast-serve/rspack.extend.mts'), validConfig);
  writeFileSync(path.join(projectRoot, 'fast-serve/invalid.mts'), invalidConfig);
  writeTsconfig('tsconfig.valid.json', 'fast-serve/rspack.extend.mts');
  writeTsconfig('tsconfig.invalid.json', 'fast-serve/invalid.mts');
}, 60_000);

afterAll(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('public package entry', () => {
  it('exports defineConfig with types from the package root', () => {
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { exports: Record<string, unknown>; types: string; files: string[] };
    expect(packageJson.exports['.']).toEqual({ types: './lib/index.d.ts', default: './lib/index.js' });
    expect(packageJson.types).toBe('./lib/index.d.ts');
    expect(packageJson.files).toContain('skills');
  });

  it('type-checks a fast-serve/rspack.extend.mts in a project without its own @rspack/core dependency', () => {
    expect(typecheck('tsconfig.valid.json')).toEqual({ ok: true, output: '' });
  });

  it('reports wrong use of the context', () => {
    const result = typecheck('tsconfig.invalid.json');
    expect(result.ok).toBe(false);
    expect(result.output).toContain('toUpperCase');
  });
});
