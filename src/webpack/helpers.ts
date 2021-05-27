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
  // fix: ".js" entry needs to be ".ts"
  // also replaces the path form /lib/* to /src/*
  // spfx not always follows path.sep settings, so just replace both variants
  const newEntry: EntryPoints = {};
  const libSearchRegexp1 = /\/lib\//gi;
  const libSearchRegexp2 = /\\lib\\/gi;

  const srcPathToReplace1 = '/src/';
  const srcPathToReplace2 = '\\src\\';

  for (const key in entry) {
    let entryPath = entry[key];
    if (entryPath.indexOf('bundle-entries') === -1) {
      entryPath = entryPath
        .replace(libSearchRegexp1, srcPathToReplace1)
        .replace(libSearchRegexp2, srcPathToReplace2)
        .slice(0, -3) + '.ts';
    } else {
      // replace paths and extensions in bundle file
      let bundleContent = fs.readFileSync(entryPath).toString();
      bundleContent = bundleContent
        .replace(libSearchRegexp1, srcPathToReplace1)
        .replace(libSearchRegexp2, srcPathToReplace2)
        .replace(/\.js/gi, '.ts');
      fs.writeFileSync(entryPath, bundleContent);
    }
    newEntry[key] = entryPath;
  }

  return newEntry;
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