import * as path from 'path';
import * as fs from 'fs';
import * as globby from 'globby';
import getPort from 'get-port';
import colors from 'colors';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const killPort = require('kill-port')

import { EntryPoints, ExternalsObject, LocalizedResources, Manifest, NodePackage, ResourceData, SPFxConfig } from './types';
import webpack from 'webpack';
import { Logger } from './logger';
import { fastFolderName, fastServemoduleName } from './consts';
import { InvalidArgumentError } from 'commander';
import { Settings } from './settings';

export function getJSONFile<T = any>(relPath: string) {
  const filePath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(filePath) as T;
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

    Logger.log(colors.yellow(`The port ${port} is in use. Trying to release...`));

    await killPort(port);

    Logger.log(colors.yellow(`The port ${port} is successfully released.`));
  }
}

export function checkVersions() {
  const packageJson = getJSONFile<NodePackage>('package.json');

  // special case for development, when dependecy is 'file:...' or 'link:...'
  if (packageJson.devDependencies[fastServemoduleName]?.indexOf(':') !== -1) {
    return;
  }

  const spfxVersion = getMinorVersion(packageJson, '@microsoft/sp-build-web');
  const fastServeVersion = getMinorVersion(packageJson, fastServemoduleName);

  if (spfxVersion !== fastServeVersion) {
    throw new Error(`SPFx Fast Serve: version mismatch. We detected the usage of SPFx 1.${spfxVersion}, but "${fastServemoduleName}" version is 1.${fastServeVersion}. Please change "spfx-fast-serve-helpers" version to ~1.${spfxVersion}.0, delete node_modules, package-lock.json and reinstall dependencies.`);
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

export function needToRunBundle() {
  const npmScript = process.env.npm_lifecycle_event;

  if (!npmScript || npmScript === 'npx') return true;

  const packageJson = getJSONFile<NodePackage>('package.json');
  const script = packageJson.scripts[npmScript];

  if (script.indexOf('--custom-serve') !== -1) {
    Logger.log(colors.yellow('We detected the old-styled "serve" command. Consider using just "fast-serve" instead. More info: https://github.com/s-KaiNet/spfx-fast-serve/blob/master/docs/Migrate-from-3-to-4.md'));

    return false;
  }

  return true;
}

export function getNpmScriptValue() {
  const npmScript = process.env.npm_lifecycle_event;

  if (!npmScript || npmScript === 'npx') return null;

  const packageJson = getJSONFile<NodePackage>('package.json');
  return packageJson.scripts[npmScript];
}

export function customParseInt(value: string): number {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number');
  }
  return parsedValue;
}

export function customParseBoolean(value: string): boolean {
  if(!value) return false;

  return value.toLowerCase() === 'true';
}

export function getTemplatesPath(fileName: string) {
  const basePath = 'templates/';

  return path.join(__dirname, '..', basePath + fileName);
}

export function nanoToSeconds(nano: bigint): string {
  return (Number(nano) / 1000000000).toFixed(2);
}

export function ensureFastServeFolder() {
  const fastServeFolder = path.join(process.cwd(), fastFolderName);
  if (!fs.existsSync(fastServeFolder)) {
    fs.mkdirSync(fastServeFolder);
  }
}

function hasPattern(patterns: { to: string }[], to: string): boolean {
  for (const pattern of patterns) {
    if (pattern.to === to) {
      return true;
    }
  }

  return false;
}
