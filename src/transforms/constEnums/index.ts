import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import type { Plugin } from 'vite';
import type { ServeContext } from '../../context.js';
import { MagicString } from 'magic-string';
import { isInside } from '../../utils/paths.js';
import { withoutQuery } from '../../utils/vite.js';
import { isProjectScript, NODE_MODULES_ID, PROJECT_SCRIPT_ID } from '../projectSource.js';
import { exportedConstEnums, globalConstEnums, referencedGlobals } from './declarations.js';
import { type AmbientEnumUse, formatAmbientEnumMessage, formatDeclarationImportMessage } from './message.js';

const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const RELATIVE_IMPORT = /^\.\.?(?:\/|$)/;
const SCRIPT_EXTENSION = /\.[cm]?jsx?$/;

export function constEnumGuardPlugin({ root, logger }: Pick<ServeContext, 'root' | 'logger'>): Plugin {
  const ambientEnums = createAmbientEnumIndex(root);
  const reportedMessages = new Map<string, string>();

  const report = (id: string, message: string) => {
    if (reportedMessages.get(id) === message) return;
    reportedMessages.set(id, message);
    logger.error(message);
  };

  return {
    name: 'fast-serve:const-enums',
    apply: 'serve',

    configureServer(server) {
      for (const event of ['add', 'change', 'unlink'] as const) {
        server.watcher.on(event, (file: string) => {
          ambientEnums.fileChanged(file);
        });
      }
    },

    resolveId: {
      filter: { id: RELATIVE_IMPORT },
      handler(source, importer) {
        if (importer === undefined || !isProjectScript(root, withoutQuery(importer))) return null;
        const declarationFile = findDeclarationOnlyModule(path.resolve(path.dirname(withoutQuery(importer)), source));
        if (declarationFile === undefined) return null;
        const constEnums = exportedConstEnums(readFileSync(declarationFile, 'utf8'));
        return this.error(formatDeclarationImportMessage(root, withoutQuery(importer), source, declarationFile, constEnums));
      },
    },

    transform: {
      filter: { id: { include: PROJECT_SCRIPT_ID, exclude: NODE_MODULES_ID } },
      handler(code, id) {
        const file = withoutQuery(id);
        if (this.environment.mode !== 'dev' || !isProjectScript(root, file)) return null;
        const declarations = ambientEnums.current();
        const uses: AmbientEnumUse[] = referencedGlobals(code, [...declarations.keys()]).map((name) => ({ name, declarationFile: declarations.get(name) ?? '' }));
        if (uses.length === 0) {
          reportedMessages.delete(file);
          return null;
        }
        const message = formatAmbientEnumMessage(root, file, uses);
        report(file, message);
        const output = new MagicString(code).prepend(`console.error(${JSON.stringify(`[fast-serve] ${message}`)});\n`);
        return { code: output.toString(), map: output.generateMap({ hires: 'boundary', source: id, includeContent: true }) };
      },
    },
  };
}

export function findDeclarationOnlyModule(target: string): string | undefined {
  const base = target.replace(SCRIPT_EXTENSION, '');
  return [`${base}.d.ts`, path.join(target, 'index.d.ts')].find((candidate) => existsSync(candidate));
}

interface AmbientEnumIndex {
  current(): ReadonlyMap<string, string>;
  fileChanged(file: string): void;
}

function scanDeclarationFile(file: string): string[] {
  try {
    return globalConstEnums(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function createAmbientEnumIndex(root: string): AmbientEnumIndex {
  const sourceDir = path.join(root, 'src');
  let byFile: Map<string, string[]> | undefined;
  let byName: Map<string, string> | undefined;

  const declarationsByFile = () => {
    byFile ??= new Map(
      globSync('**/*.d.{ts,mts,cts}', { cwd: sourceDir, absolute: true, ignore: ['**/node_modules/**'] }).map((file) => [path.normalize(file), scanDeclarationFile(file)]),
    );
    return byFile;
  };

  return {
    current() {
      byName ??= new Map([...declarationsByFile()].flatMap(([file, names]) => names.map((name) => [name, file] as const)));
      return byName;
    },
    fileChanged(file) {
      if (!byFile || !DECLARATION_FILE.test(file) || !isInside(sourceDir, file)) return;
      byFile.set(path.normalize(file), existsSync(file) ? scanDeclarationFile(file) : []);
      byName = undefined;
    },
  };
}
