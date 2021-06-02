import * as path from 'path';
import * as fs from 'fs';
import { Settings } from '../common/settings';
import { EntryPoints, LocalizedResources, ResourceData } from '../common/types';
import globby from 'globby';
import webpack from 'webpack';

export function getJSONFile<T = any>(relPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(path.join(process.cwd(), relPath)) as T;
}

export function setDefaultServeSettings(settings: Settings) {
  const defaultServeSettings: Settings['serve'] = {
    open: true,
    fullScreenErrors: true,
    loggingLevel: 'normal',
    hotRefresh: false,
    replaceNativeServe: false,
    openUrl: undefined
  }
  settings.serve = settings.serve || {} as Settings['serve'];

  settings.serve = Object.assign(defaultServeSettings, settings.serve);

  if (settings.cli.isLibraryComponent) {
    settings.serve.open = false;
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
  if (fs.existsSync(tsPath)) {
    return tsPath;
  }

  // in case if entry is .tsx
  tsPath = tsPath + 'x';

  if (fs.existsSync(tsPath)) {
    return tsPath;
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
        const fileName = path.basename(data.absoluteFilename);
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