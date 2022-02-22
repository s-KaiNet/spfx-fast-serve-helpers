import * as path from 'path';
import * as fs from 'fs';
import * as globby from 'globby';
import getPort from 'get-port';
import colors from 'colors';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const killPort = require('kill-port')

import { Settings } from '../common/settings';
import { EntryPoints, ExternalsObject, LocalizedResources, Manifest, NodePackage, ResourceData, SPFxConfig } from '../common/types';
import webpack from 'webpack';

export function getJSONFile<T = any>(relPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.join(process.cwd(), relPath)) as T;
}

export function setDefaultServeSettings(settings: Settings) {
  const defaultServeSettings: Settings['serve'] = {
    eslint: false,
    fullScreenErrors: true,
    loggingLevel: 'normal',
    hotRefresh: false,
    openUrl: undefined, 
    reactProfiling: false,
    containers: undefined
  }
  settings.serve = settings.serve || {} as Settings['serve'];

  settings.serve = Object.assign(defaultServeSettings, settings.serve);

  if (settings.cli.isLibraryComponent) {
    settings.serve.openUrl = undefined;
  }
}

export function getLoggingLevel(level: Settings['serve']['loggingLevel']) {
  if (level === 'minimal') {
    return {
      all: false,
      colors: true,
      errors: true
    }
  }

  if (level === 'normal') {
    return {
      all: false,
      colors: true,
      errors: true,
      warnings: true,
      timings: true,
      entrypoints: true
    }
  }

  if (level === 'detailed') {
    return {
      all: false,
      colors: true,
      errors: true,
      timings: true,
      assets: true,
      warnings: true
    }
  }

  throw new Error('Unsupported log level: ' + level);
}

export function getEntryPoints(entry: webpack.Entry) {
  // fix: ".js" entry needs to be ".ts[x]"
  // also replaces the path form /lib/* to /src/*
  // spfx not always follows path.sep settings, so just replace both variants
  const newEntry: EntryPoints = {};

  for (const key in entry) {
    let entryPath = entry[key] as string;
    if (entryPath.indexOf('bundle-entries') === -1) {
      entryPath = createTsEntryPath(entryPath);
    } else {
      // replace paths and extensions in bundle file
      let bundleContent = fs.readFileSync(entryPath).toString();
      bundleContent = createTsEntriesForBundledPackage(bundleContent);
      fs.writeFileSync(entryPath, bundleContent);
    }
    newEntry[key] = entryPath;
  }

  return newEntry;
}

function createTsEntriesForBundledPackage(content: string) {
  const search = /require\('(?<jsPath>.*)'\)/gi;
  let newContent = content.slice();
  let match = search.exec(content);

  do {
    const jsPath = match.groups.jsPath;
    const tsPath = createTsEntryPath(jsPath);
    newContent = newContent.replace(jsPath, tsPath);
  } while ((match = search.exec(content)) !== null)

  return newContent;
}

function createTsEntryPath(jsPath: string) {
  const libSearchRegexp1 = /\/lib\//gi;
  const libSearchRegexp2 = /\\lib\\/gi;

  const srcPathToReplace1 = '/src/';
  const srcPathToReplace2 = '\\src\\';

  const tsPath = jsPath
    .replace(libSearchRegexp1, srcPathToReplace1)
    .replace(libSearchRegexp2, srcPathToReplace2)
    .slice(0, -3) + '.ts';

  return getEntryPath(tsPath);
}

function getEntryPath(tsPath: string) {
  let pathToCheck = tsPath;
  // if bundled entry, then the path is received in format "../../lib/webparts/contextInfo/ContextInfoWebPart.js"
  if (!path.isAbsolute(pathToCheck)) {
    const bundledEntriesPath = path.join(process.cwd(), 'temp/bundle-entries');
    pathToCheck = path.join(bundledEntriesPath, pathToCheck);
  }

  if (fs.existsSync(pathToCheck)) {
    return tsPath;
  }

  // in case if entry is .tsx
  pathToCheck = pathToCheck + 'x';

  if (fs.existsSync(pathToCheck)) {
    return tsPath + 'x';
  }

  throw new Error('Unable to resolve entry path. Path received: ' + tsPath);
}

export function addCopyLocalizedResources(localizedResources: LocalizedResources) {
  const patterns = [];
  for (const resourceKey in localizedResources) {
    const resourcePath = localizedResources[resourceKey];
    const from = resourcePath.replace(/^lib/gi, 'src').replace('{locale}', '*');
    patterns.push({
      flatten: true,
      from,
      noErrorOnMissing: true,
      to: (data: { absoluteFilename: string }) => {
        let fileName = path.basename(data.absoluteFilename);
        // special case when locale placehoder isn't used
        if (!resourcePath.endsWith('{locale}.js')) {
          fileName = 'default.js';
        }

        return resourceKey + '_' + fileName;
      }
    });
  }

  return patterns;
}

export function trimLeft(str: string, charlist: string) {
  return str.replace(new RegExp('^[' + charlist + ']+'), '');
}

export function trimRight(str: string, charlist: string) {
  return str.replace(new RegExp('[' + charlist + ']+$'), '');
}

export function trim(str: string, charlist: string) {
  return trimRight(trimLeft(str, charlist), charlist);
}

export function createKeyFromPath(path: string) {
  return trimLeft(path, '/\\\\').replace(/\//gi, '|').replace(/\\/gi, '|');
}

export function createResourcesMap(localizedResources: LocalizedResources) {
  const resourcesMap: Record<string, ResourceData> = {};

  for (const resourceKey in localizedResources) {
    const resourcePath = localizedResources[resourceKey];
    const search = resourcePath.replace(/^lib/gi, 'src').replace('{locale}.js', '*.ts');
    const exclude = '!' + search.replace('*.ts', '*.d.ts');
    const typescriptResources = globby.sync([search, exclude], {
      cwd: process.cwd()
    });

    if (!typescriptResources?.length) {
      continue;
    }

    for (const resourcePath of typescriptResources) {
      const key = createKeyFromPath(resourcePath);
      const fileName = `${resourceKey}_${path.basename(resourcePath).replace('.ts', '.js')}`;
      resourcesMap[key] = {
        path: trimLeft(resourcePath, '/\\\\'),
        fileName
      }
    }
  }

  return resourcesMap;
}

export async function freePortIfInUse(port: number) {
  const freePort = await getPort({ port, host: 'localhost' });

  // the needed port is not free
  if (freePort !== port) {
    // eslint-disable-next-line no-console
    console.log(colors.yellow(`The port ${port} is in use. Trying to release...`));
    await killPort(port);
    // eslint-disable-next-line no-console
    console.log(colors.yellow(`The port ${port} is successfully released.`));
  }
}

export function checkVersions() {
  const packageJson = getJSONFile<NodePackage>('package.json');
  const spfxVersion = getMinorVersion(packageJson, '@microsoft/sp-build-web');
  const fastServeVersion = getMinorVersion(packageJson, 'spfx-fast-serve-helpers');

  if (spfxVersion !== fastServeVersion) {
    throw new Error(`SPFx Fast Serve: version mismatch. We detected the usage of SPFx 1.${spfxVersion}, but "spfx-fast-serve-helpers" version is 1.${fastServeVersion}. Please change "spfx-fast-serve-helpers" version to ~1.${spfxVersion}.0, delete node_modules, package-lock.json and reinstall dependencies.`);
  }
}

function getMinorVersion(packageJson: NodePackage, dependecyToCheck: string) {
  let version: string = packageJson.devDependencies[dependecyToCheck];

  if (!version) {
    version = packageJson.dependencies[dependecyToCheck];
  }

  if (!version) {
    throw new Error(`SPFx Fast Serve: unable to find dependency ${dependecyToCheck}`);
  }

  if (version.indexOf('~') === 0 || version.indexOf('^') === 0) {
    version = version.substr(1);
  }
  return parseInt(version.split('.')[1]);
}

export function getExternalComponents() {
  const originalWebpackConfig = getJSONFile('temp/_webpack_config.json');
  for (const plugin of originalWebpackConfig.plugins) {
    if (plugin._options && plugin._options.externalComponents) {
      return plugin._options.externalComponents;
    }
  }

  throw new Error('Unable to resolve AsyncComponentPlugin');
}

export function createLocalExternals(externals: SPFxConfig['externals']): Record<string, ExternalsObject> {
  if (!externals) return null;

  const result: Record<string, ExternalsObject> = {};

  for (const name in externals) {
    const info = externals[name];
    if (typeof info === 'string') {
      // ignore cdn loaded libraries
      if (info.startsWith('http')) {
        continue;
      }

      result[name] = { path: info };
    } else {
      if (info.path.startsWith('http')) {
        continue;
      }
      result[name] = { path: info.path };
    }
  }

  return result;
}

export function addCopyLocalExternals(externals: Record<string, ExternalsObject>, manifest: Manifest[], originalEntries: string[]) {
  if (!externals) return [];

  const patterns = [];
  for (const jsModule of manifest) {
    if (jsModule.loaderConfig
      && jsModule.loaderConfig.entryModuleId
      && originalEntries.indexOf(jsModule.loaderConfig.entryModuleId) !== -1) {

      for (const resourceKey in jsModule.loaderConfig.scriptResources) {
        const resource = jsModule.loaderConfig.scriptResources[resourceKey];
        if (externals[resourceKey]) {
          const from = externals[resourceKey].path;
          const to = resource.path;
          if (!hasPattern(patterns, to)) {
            patterns.push({
              flatten: true,
              from,
              noErrorOnMissing: true,
              to
            });
          }
        }
      }
    }
  }
  return patterns;
}

function hasPattern(patterns: { to: string }[], to: string): boolean {
  for (const pattern of patterns) {
    if (pattern.to === to) {
      return true;
    }
  }

  return false;
}

export function logDebugString() {
  // eslint-disable-next-line no-console
  console.log(`${getTimeString()} [${colors.cyan('fast-serve')}] To load your scripts, use this query string: ${colors.yellow('?debug=true&noredir=true&debugManifestsFile=https://localhost:4321/temp/manifests.js')}`);
}

function getTimeString() {
  const now = new Date();
  return `[${colors.gray(`${('0' + now.getHours()).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`)}]`;
}
