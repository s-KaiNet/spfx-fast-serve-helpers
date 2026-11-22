import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import { createProject } from '../project/index.js';
import { startDevServer } from '../server/index.js';
import { startDevSession, type DevSession } from '../session/index.js';
import { copyCompileFixture, copyLibraryFixture, packageDirectory, type FixtureCopy } from '../testing/compileKit.js';
import { freePort, selfSignedCertificate } from '../testing/devServerKit.js';
import { findProjectEslint } from './projectEslint.js';
import { createLintRunner } from './runner.js';
import { WORKER_FLAG } from './worker.js';

const HELLO = 'src/webparts/hello/components/Hello.tsx';
const HELLO_PROPS = 'src/webparts/hello/components/IHelloProps.ts';
const UNUSED = 'const unusedContoso = 1;';
const FLOATING = 'async function pingContoso(): Promise<void> {}\npingContoso();';

const ESLINT_CONFIG = `import tseslint from 'typescript-eslint';

const local = {
  rules: {
    'needs-types': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        if (context.sourceCode.parserServices?.program == null) {
          throw new Error("You have used a rule which requires type information, but don't have parserOptions set to generate type information for this file.");
        }
        return {};
      },
    },
  },
};

export default [
  { ignores: ['src/generated/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    plugins: { '@typescript-eslint': tseslint.plugin, local },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-var': 'error',
      'local/needs-types': 'error',
    },
  },
];
`;

const TSCONFIG = {
  compilerOptions: { target: 'es2017', module: 'esnext', moduleResolution: 'node', jsx: 'react', strict: true, skipLibCheck: true, types: [], lib: ['dom', 'es2017'] },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
};

function lintFixture(): FixtureCopy {
  const fixture = copyCompileFixture({ 'tsconfig.json': TSCONFIG, 'eslint.config.mjs': ESLINT_CONFIG });
  fixture.linkPackage('eslint');
  fixture.linkPackage('typescript-eslint');
  fixture.linkLocalPackage('typescript', packageDirectory('typescript-5'));
  return fixture;
}

function recordingLogger(messages: string[]): Logger {
  return {
    info: (message) => messages.push(`info: ${message}`),
    warn: (message) => messages.push(`warn: ${message}`),
    error: (message) => messages.push(`error: ${message}`),
  };
}

function lintWorkers(): string[] {
  const listing = execFileSync('ps', ['-o', 'pid=,args=', '--ppid', String(process.pid)], { encoding: 'utf8' });
  return listing.split('\n').filter((line) => line.includes(WORKER_FLAG));
}

function poll(condition: () => boolean, describeFailure: () => string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) resolve();
      else if (Date.now() - startedAt > timeoutMs) reject(new Error(describeFailure()));
      else setTimeout(check, 25);
    };
    check();
  });
}

function withLines(source: string, ...lines: string[]): string {
  return `${source.trimEnd()}\n${lines.join('\n')}\n`;
}

describe('linting saved files while serving', { timeout: 90_000 }, () => {
  let fixture: FixtureCopy;
  let session: DevSession;
  const messages: string[] = [];
  const lintLines = (from: number) => messages.slice(from).filter((message) => /^(info|warn|error): lint: /.test(message));
  const waitFor = (pattern: RegExp, from: number) =>
    poll(
      () => messages.slice(from).some((message) => pattern.test(message)),
      () => `timed out waiting for ${String(pattern)}\n${messages.slice(from).join('\n')}`,
    );

  beforeAll(async () => {
    fixture = lintFixture();
    session = await startDevSession({
      root: fixture.root,
      cli: { typeCheck: false, port: await freePort() },
      logger: recordingLogger(messages),
      onRestartFailed: (error) => {
        messages.push(`restart failed: ${String(error)}`);
      },
      env: {},
      https: selfSignedCertificate(fixture.root),
      outputPath: path.join(fixture.root, 'out'),
      settleMs: 50,
    });
  }, 60_000);

  afterAll(async () => {
    await session.close();
    await poll(
      () => lintWorkers().length === 0,
      () => `lint workers left after close:\n${lintWorkers().join('\n')}`,
      5000,
    );
    fixture.remove();
  });

  it('lints by default in one background process started after the first compile', async () => {
    expect(messages).toContain(`info: port ${new URL(session.origin).port} (${session.origin}), locale en-us, overlay on, type check off, lint on`);
    await poll(
      () => lintWorkers().length === 1,
      () => `expected 1 lint worker:\n${lintWorkers().join('\n')}`,
      5000,
    );
    expect(messages.filter((message) => message.startsWith('error:'))).toEqual([]);
  });

  it('reports a saved file once without type-aware rules, never in the rebuild line, and "clean" once fixed', async () => {
    const source = fixture.read(HELLO);
    const from = messages.length;
    fixture.write(HELLO, withLines(source, UNUSED, FLOATING));
    await waitFor(/^warn: lint: src\/webparts\/hello\/components\/Hello\.tsx: 1 warning$/m, from);
    const [block, ...others] = lintLines(from);
    expect(others).toEqual([]);
    expect(block).toMatch(/\n {2}8:7 {2}warning {2}'unusedContoso' is assigned a value but never used\. {2}@typescript-eslint\/no-unused-vars$/);
    expect(block).not.toContain('no-floating-promises');
    expect(block).not.toContain('needs-types');
    expect(messages.slice(from).filter((message) => message.includes('rebuilt'))).toEqual([`info: rebuilt in ${/\d+/.exec(messages.slice(from).find((message) => message.includes('rebuilt')) ?? '')?.[0] ?? ''} ms (${HELLO})`]);

    const again = messages.length;
    fixture.write(HELLO, `${withLines(source, UNUSED, FLOATING)}\n`);
    await waitFor(/rebuilt in/, again);
    await delay(1000);
    expect(lintLines(again)).toEqual([]);

    const fixed = messages.length;
    fixture.write(HELLO, source);
    await waitFor(/^info: lint: src\/webparts\/hello\/components\/Hello\.tsx: clean$/, fixed);
    await delay(500);
    expect(lintLines(fixed)).toEqual([`info: lint: ${HELLO}: clean`]);
  });

  it('lints a type-only file that is not in the Rspack graph, without a "rebuilt" line', async () => {
    const source = fixture.read(HELLO_PROPS);
    const from = messages.length;
    fixture.write(HELLO_PROPS, withLines(source, 'var legacyContoso: number = 1;', 'export type Legacy = typeof legacyContoso;'));
    await waitFor(/^warn: lint: src\/webparts\/hello\/components\/IHelloProps\.ts: 1 error, 1 warning$/m, from);
    expect(lintLines(from)[0]).toContain('error    Unexpected var, use let or const instead.  no-var');
    fixture.write(HELLO_PROPS, source);
    await waitFor(/IHelloProps\.ts: clean$/, from);
    expect(messages.slice(from).filter((message) => message.includes('rebuilt'))).toEqual([]);
  });

  it('skips files the config ignores', async () => {
    const from = messages.length;
    fixture.write('src/generated/Generated.ts', `${UNUSED}\nexport {};\n`);
    fixture.write(HELLO, withLines(fixture.read(HELLO), UNUSED));
    await waitFor(/Hello\.tsx: 1 warning$/m, from);
    expect(lintLines(from).filter((message) => message.includes('Generated'))).toEqual([]);
  });

  it('reports a broken ESLint config once and lints again when it is fixed, without a restart', async () => {
    const from = messages.length;
    fixture.write('eslint.config.mjs', `${ESLINT_CONFIG}\nexport const broken = ;\n`);
    await waitFor(/^error: lint: ESLint could not load eslint\.config\.mjs, linting the project is off until the file changes:\n/, from);
    expect(messages.slice(from)).toContain('info: lint: eslint.config.mjs changed, reloading ESLint');
    const fixed = messages.length;
    fixture.write('eslint.config.mjs', ESLINT_CONFIG.replace("'no-var': 'error'", "'no-var': 'warn'"));
    await waitFor(/^info: lint: eslint\.config\.mjs changed, reloading ESLint$/, fixed);
    const saved = messages.length;
    fixture.write(HELLO_PROPS, withLines(fixture.read(HELLO_PROPS), 'export var reloadedContoso = 1;'));
    await waitFor(/^warn: lint: src\/webparts\/hello\/components\/IHelloProps\.ts: 1 warning\n.*no-var$/, saved);
    expect(session.restarts).toBe(0);
    expect(lintWorkers()).toHaveLength(1);
  });

  it('reports type-aware rules with "full" after a restart, with one lint process', async () => {
    const from = messages.length;
    fixture.write('fast-serve/config.json', { lint: 'full' });
    await waitFor(/restarted in/, from);
    expect(session.restarts).toBe(1);
    const saved = messages.length;
    fixture.write(HELLO, withLines(fixture.read(HELLO), FLOATING));
    await waitFor(/^warn: lint: src\/webparts\/hello\/components\/Hello\.tsx: 1 error, 1 warning$/m, saved);
    expect(lintLines(saved)[0]).toContain('@typescript-eslint/no-floating-promises');
    expect(lintWorkers()).toHaveLength(1);
  });

  it('stops linting with "lint": false', async () => {
    const from = messages.length;
    fixture.write('fast-serve/config.json', { lint: false });
    await waitFor(/restarted in/, from);
    await poll(
      () => lintWorkers().length === 0,
      () => `lint worker still running:\n${lintWorkers().join('\n')}`,
      5000,
    );
    const saved = messages.length;
    fixture.write(HELLO, withLines(fixture.read(HELLO), 'const anotherUnused = 2;'));
    await waitFor(/rebuilt in/, saved);
    await delay(800);
    expect(lintLines(saved)).toEqual([]);
  });
});

describe('a linter from the extend file', () => {
  it("replaces fast-serve's lint", async () => {
    const fixture = lintFixture();
    const messages: string[] = [];
    const logger = recordingLogger(messages);
    const project = createProject(fixture.root, logger);
    const options = resolveOptions({ cli: { typeCheck: false, port: await freePort() }, defaults: project.serveConfig() }, {});
    class ESLintRspackPlugin {
      apply(): void {
        messages.push('theirs applied');
      }
    }
    const server = await startDevServer({
      setup: { root: fixture.root, project, options },
      logger,
      https: selfSignedCertificate(fixture.root),
      outputPath: path.join(fixture.root, 'out'),
      persistentCache: false,
      extend: { file: path.join(fixture.root, 'fast-serve/rspack.extend.mjs'), config: { plugins: [new ESLintRspackPlugin()] }, dependencies: [] },
    });
    try {
      await delay(300);
      expect(messages).toContain('theirs applied');
      expect(messages).toContain("info: lint: using the ESLintRspackPlugin from the Rspack extend file (fast-serve's own lint is skipped)");
      expect(lintWorkers()).toEqual([]);
    } finally {
      await server.close();
      fixture.remove();
    }
  }, 30_000);
});

describe('the lint runner', { timeout: 60_000 }, () => {
  let fixture: FixtureCopy;

  beforeAll(() => {
    fixture = lintFixture();
  });

  afterAll(() => {
    fixture.remove();
  });

  it('waits for a running compile before linting, and stops its process', async () => {
    const eslint = findProjectEslint(fixture.root);
    if (!eslint.found) throw new Error(eslint.reason);
    const messages: string[] = [];
    const runner = createLintRunner({
      root: fixture.root,
      roots: [{ label: 'the project', root: fixture.root, sourceDir: path.join(fixture.root, 'src'), eslintPath: eslint.eslintPath, configFile: eslint.configFile }],
      mode: 'skip-type-aware',
      logger: recordingLogger(messages),
      delayMs: 10,
    });
    try {
      runner.start();
      fixture.write(HELLO, withLines(fixture.read(HELLO), UNUSED));
      runner.compileStarted();
      runner.fileChanged(path.join(fixture.root, HELLO), true);
      runner.fileChanged(path.join(fixture.root, 'src/webparts/hello/styles.scss'), true);
      await delay(1500);
      expect(messages).toEqual([]);
      runner.compileFinished();
      await poll(
        () => messages.length > 0,
        () => 'no lint output after the compile',
      );
      expect(messages).toEqual([expect.stringMatching(/^warn: lint: src\/webparts\/hello\/components\/Hello\.tsx: 1 warning\n/)]);
      expect(lintWorkers()).toHaveLength(1);
    } finally {
      runner.stop();
    }
    await poll(
      () => lintWorkers().length === 0,
      () => `lint worker left after stop:\n${lintWorkers().join('\n')}`,
      5000,
    );
  });

  it("lints a linked library's files with the library's own config", async () => {
    const library = copyLibraryFixture({ 'eslint.config.mjs': "export default [{ files: ['**/*.ts'], rules: { 'no-var': 'warn' } }];" });
    mkdirSync(path.join(library.root, 'node_modules'), { recursive: true });
    symlinkSync(packageDirectory('eslint'), path.join(library.root, 'node_modules/eslint'), 'dir');
    const consumer = findProjectEslint(fixture.root);
    const own = findProjectEslint(library.root);
    if (!consumer.found || !own.found) throw new Error('ESLint not found');
    const messages: string[] = [];
    const runner = createLintRunner({
      root: fixture.root,
      roots: [
        { label: 'the project', root: fixture.root, sourceDir: path.join(fixture.root, 'src'), eslintPath: consumer.eslintPath, configFile: consumer.configFile },
        { label: '@contoso/corp-lib', root: library.root, sourceDir: path.join(library.root, 'src'), eslintPath: own.eslintPath, configFile: own.configFile },
      ],
      mode: 'skip-type-aware',
      logger: recordingLogger(messages),
      delayMs: 10,
    });
    try {
      library.write('src/shared/format.ts', 'var legacy = 1;\nexport { legacy };\n');
      runner.fileChanged(path.join(library.root, 'src/shared/format.ts'), true);
      await poll(
        () => messages.length > 0,
        () => 'no lint output for the library file',
      );
      expect(messages).toEqual([expect.stringMatching(/^warn: lint: .*corp-lib\/src\/shared\/format\.ts: 1 warning\n {2}1:1 {2}warning {2}Unexpected var, use let or const instead\. {2}no-var$/)]);
    } finally {
      runner.stop();
      library.remove();
    }
  });
});
