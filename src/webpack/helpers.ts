import * as path from 'path';
import * as fs from 'fs';
import { Settings } from '../common/settings';
import { EntryPoints, LocalizedResources } from '../common/types';

export function getJSONFile(relPath: string) {
  return require(path.join(process.cwd(), relPath));
}

export function setDefaultServeSettings(settings: Settings) {
  const defaultServeSettings = {
    open: true,
    fullScreenErrors: true,
    loggingLevel: 'normal'
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

export function getEntryPoints(entry: EntryPoints) {
  // fix: ".js" entry needs to be ".ts[x]"
  // also replaces the path form /lib/* to /src/*
  // spfx not always follows path.sep settings, so just replace both variants
  const newEntry: EntryPoints = {};

  for (const key in entry) {
    let entryPath = entry[key];
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
      to: (data: { absoluteFilename: string }) => {
        const fileName = path.basename(data.absoluteFilename);
        return resourceKey + '_' + fileName;
      }
    });
  }

  return patterns;
}