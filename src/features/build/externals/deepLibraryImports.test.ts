import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deepLibraryImportWarning, projectRelativePath } from './deepLibraryImports.js';

describe('projectRelativePath', () => {
  let workspace: string;
  let root: string;
  let linkedRoot: string;

  const file = (relativePath: string): string => {
    const target = path.join(workspace, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '');
    return target;
  };

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'fast-serve-deep-imports-'));
    root = path.join(workspace, 'project');
    file('project/src/webparts/x/X.tsx');
    file('project/node_modules/.pnpm/graph@1.0.0/node_modules/graph/lib/index.js');
    file('project/src/vendor/node_modules/inner/index.js');
    file('shared/lib/index.js');
    symlinkSync(path.join(root, 'node_modules/.pnpm/graph@1.0.0/node_modules/graph'), path.join(root, 'node_modules/graph'));
    symlinkSync(path.join(workspace, 'shared'), path.join(root, 'node_modules/shared'));
    symlinkSync(path.join(root, 'src'), path.join(root, 'linked-src'));
    linkedRoot = path.join(workspace, 'linked-project');
    symlinkSync(root, linkedRoot);
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('returns the project-relative path of project code', () => {
    expect(projectRelativePath(path.join(root, 'src/webparts/x/X.tsx'), root)).toBe('src/webparts/x/X.tsx');
    expect(projectRelativePath(path.join(linkedRoot, 'src/webparts/x/X.tsx'), root)).toBe('src/webparts/x/X.tsx');
    expect(projectRelativePath(path.join(root, 'linked-src/webparts/x/X.tsx'), root)).toBe('src/webparts/x/X.tsx');
  });

  it('rejects files in any node_modules, including pnpm and symlinked packages', () => {
    expect(projectRelativePath(path.join(root, 'node_modules/graph/lib/index.js'), root)).toBeUndefined();
    expect(projectRelativePath(path.join(root, 'node_modules/.pnpm/graph@1.0.0/node_modules/graph/lib/index.js'), root)).toBeUndefined();
    expect(projectRelativePath(path.join(root, 'src/vendor/node_modules/inner/index.js'), root)).toBeUndefined();
  });

  it('treats the code of linked library projects as project code, relative to the project', () => {
    expect(projectRelativePath(path.join(root, 'node_modules/shared/lib/index.js'), root, [path.join(workspace, 'shared')])).toBe('../shared/lib/index.js');
    expect(projectRelativePath(path.join(workspace, 'shared/lib/index.js'), root, [path.join(root, 'node_modules/shared')])).toBe('../shared/lib/index.js');
    expect(projectRelativePath(path.join(root, 'node_modules/graph/lib/index.js'), root, [path.join(workspace, 'shared')])).toBeUndefined();
  });

  it('rejects files outside the project root, including linked packages', () => {
    expect(projectRelativePath(path.join(root, 'node_modules/shared/lib/index.js'), root)).toBeUndefined();
    expect(projectRelativePath(path.join(workspace, 'shared/lib/index.js'), root)).toBeUndefined();
  });
});

describe('deepLibraryImportWarning', () => {
  const deepImport = { request: '@microsoft/microsoft-graph-client/lib/es/src/middleware/MiddlewareUtil', packageName: '@microsoft/microsoft-graph-client' };

  it('names the importing project file', () => {
    expect(deepLibraryImportWarning({ ...deepImport, importers: ['src/webparts/x/X.tsx'] })).toBe(
      'src/webparts/x/X.tsx imports "@microsoft/microsoft-graph-client/lib/es/src/middleware/MiddlewareUtil", a deep import into the SPFx library @microsoft/microsoft-graph-client: it is bundled as a separate copy, not the instance SharePoint loads; import from "@microsoft/microsoft-graph-client" instead',
    );
  });

  it('names the first importer and counts the others', () => {
    expect(deepLibraryImportWarning({ ...deepImport, importers: ['src/a.ts', 'src/b.ts', 'src/c.ts'] })).toMatch(/^src\/a\.ts \(and 2 more files\) imports "/);
    expect(deepLibraryImportWarning({ ...deepImport, importers: ['src/a.ts', 'src/b.ts'] })).toMatch(/^src\/a\.ts \(and 1 more file\) imports "/);
  });
});
