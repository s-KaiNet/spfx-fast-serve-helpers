import type { JsonObject } from '../utils/guards.js';
import { readBundles } from './bundles.js';
import { readConfigExternals } from './configExternals.js';
import { scanLibraries } from './libraries.js';
import { readLibraryComponent, type LibraryComponentSource } from './localLibraries.js';
import { readLocalizedResources } from './localizedResources.js';
import { once, oncePerKey } from './memo.js';
import { projectFiles, readBuildConfig, readPackageJson, readServeConfig, type ProjectFiles } from './projectFiles.js';
import { loadSassConfiguration, type SassConfiguration } from './sassConfiguration.js';
import { findSourceFile, SOURCE_EXTENSIONS } from './sourcePaths.js';
import { projectTsconfig } from './projectTsconfig.js';
import type { TsconfigPaths } from './tsconfigPaths.js';
import type {
  ConfigExternal,
  LocalizedResource,
  LocalLibraryPackage,
  PackageJson,
  ProjectLogger,
  ProjectRole,
  ServeConfig,
  SpfxBundle,
  SpfxComponent,
  SpfxLibrary,
} from './types.js';

export interface ProjectOptions {
  deployedLibraries?: readonly string[];
  role?: ProjectRole;
}

export interface LocalLibrary {
  readonly packageName: string;
  readonly root: string;
  readonly id: string;
  readonly alias: string;
  readonly version: string;
  readonly entryFile: string;
  readonly sourceDir: string;
  readonly project: SpfxProject;
}

export interface CodeRoot {
  readonly label: string;
  readonly root: string;
  readonly sourceDir: string;
  readonly project: SpfxProject;
}

export interface SpfxProject {
  readonly root: string;
  readonly role: ProjectRole;
  packageJson(): PackageJson;
  serveConfig(): ServeConfig;
  bundles(): SpfxBundle[];
  components(): SpfxComponent[];
  libraryComponent(): LibraryComponentSource | undefined;
  libraries(): Map<string, SpfxLibrary>;
  localLibraries(): LocalLibrary[];
  codeRoots(): CodeRoot[];
  configExternals(): Map<string, ConfigExternal>;
  localizedResources(locale: string): Map<string, LocalizedResource>;
  tsconfigPaths(): TsconfigPaths | undefined;
  tsconfigCompilerOptions(): JsonObject;
  sassConfiguration(): Promise<SassConfiguration>;
  modelFiles(): string[];
}

const CONSUMER_LABEL = 'the project';

export function createProject(root: string, logger: ProjectLogger, { deployedLibraries = [], role = 'consumer' }: ProjectOptions = {}): SpfxProject {
  const files = projectFiles(root);
  const packageJson = once(() => readPackageJson(files.packageJson));
  const buildConfig = once(() => readBuildConfig(files.config));
  const libraryComponent = once(() => readLibraryComponent(root, packageJson().version));
  const bundles = once(() => {
    const result = readBundles({ root, config: buildConfig(), packageVersion: () => packageJson().version, logger });
    if (result.length > 0 && role === 'consumer') warnThatLibraryComponentIsNotServed(libraryComponent(), logger);
    return result;
  });
  const components = (): SpfxComponent[] => bundles().flatMap((bundle) => bundle.components);
  const libraryScan = once(() => scanLibraries(root, { deployedLibraries }));
  const libraries = (): Map<string, SpfxLibrary> => libraryScan().deployed;
  const localLibraries = once(() => [...libraryScan().local.values()].flatMap((found) => loadLocalLibrary(found, logger)));
  const ownConfigExternals = once(() => readConfigExternals(root, buildConfig().externals, libraries(), logger));
  const configExternals = once(() => withLibraryConfigExternals(localLibraries(), ownConfigExternals()));
  const tsconfig = projectTsconfig(files.tsconfig, logger);
  const project: SpfxProject = {
    root,
    role,
    packageJson,
    serveConfig: once(() => readServeConfig(files.serve)),
    bundles,
    components,
    libraryComponent,
    libraries,
    localLibraries,
    codeRoots: once(() => [{ label: CONSUMER_LABEL, root, sourceDir: files.sourceDir, project }, ...localLibraries().map(libraryCodeRoot)]),
    configExternals,
    localizedResources: oncePerKey((locale: string) => readLocalizedResources(root, buildConfig(), locale, logger)),
    tsconfigPaths: tsconfig.pathResolution,
    tsconfigCompilerOptions: tsconfig.compilerOptions,
    sassConfiguration: once(() => loadSassConfiguration(root, logger)),
    modelFiles: () => modelFilesOf(project, files, tsconfig.files),
  };
  return project;
}

function warnThatLibraryComponentIsNotServed(component: LibraryComponentSource | undefined, logger: ProjectLogger): void {
  if (component === undefined) return;
  logger.warn(`${component.alias}: library components are not served (SharePoint loads the deployed copy); projects that link this one as a dependency compile its src`);
}

function loadLocalLibrary({ packageName, root }: LocalLibraryPackage, logger: ProjectLogger): LocalLibrary[] {
  const libraryLogger: ProjectLogger = {
    warn: (message) => {
      logger.warn(`${packageName}: ${message}`);
    },
  };
  const project = createProject(root, libraryLogger, { role: 'library' });
  const component = project.libraryComponent();
  const entryFile = component && findSourceFile(root, component.entrypoint, SOURCE_EXTENSIONS);
  if (!component || !entryFile) {
    libraryLogger.warn(`the source of the library entry ${component?.entrypoint ?? ''} was not found under src/, the package is bundled from its main file`);
    return [];
  }
  const { id, alias, version } = component;
  return [{ packageName, root, id, alias, version, entryFile, sourceDir: projectFiles(root).sourceDir, project }];
}

function libraryCodeRoot({ packageName, root, sourceDir, project }: LocalLibrary): CodeRoot {
  return { label: packageName, root, sourceDir, project };
}

function withLibraryConfigExternals(libraries: readonly LocalLibrary[], own: ReadonlyMap<string, ConfigExternal>): Map<string, ConfigExternal> {
  const merged = new Map<string, ConfigExternal>();
  for (const library of libraries) {
    for (const [name, external] of library.project.configExternals()) if (!merged.has(name)) merged.set(name, external);
  }
  for (const [name, external] of own) merged.set(name, external);
  return merged;
}

function localFileExternals(externals: ReadonlyMap<string, ConfigExternal>): string[] {
  return [...externals.values()].flatMap(({ source }) => (source.type === 'file' ? [source.file] : []));
}

function modelFilesOf(project: SpfxProject, files: ProjectFiles, tsconfigFiles: () => readonly string[]): string[] {
  return [
    files.packageJson,
    files.config,
    ...roleModelFiles(project, files),
    ...project.components().map((component) => component.manifestFile),
    ...tsconfigFiles(),
    ...localFileExternals(project.configExternals()),
    ...project.localLibraries().flatMap((library) => library.project.modelFiles()),
  ];
}

function roleModelFiles(project: SpfxProject, files: ProjectFiles): string[] {
  if (project.role === 'consumer') return [files.serve, files.sass];
  const manifestFile = project.libraryComponent()?.manifestFile;
  return manifestFile ? [manifestFile] : [];
}
