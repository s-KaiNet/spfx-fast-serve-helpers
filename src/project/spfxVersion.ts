import { createRequire } from 'node:module';
import path from 'node:path';
import { isObject } from '../shared/guards.js';
import { readJsoncFile } from '../shared/jsonc.js';

const SPFX_VERSION_PACKAGES = ['@microsoft/sp-core-library', '@microsoft/spfx-heft-plugins', '@microsoft/sp-webpart-base'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'] as const;

export interface InstalledSpfxVersion {
  kind: 'installed';
  version: string;
  packageName: string;
}

export type SpfxVersionSource = InstalledSpfxVersion | { kind: 'declared'; range: string; packageName: string } | { kind: 'missing' };

export function findSpfxVersion(root: string): SpfxVersionSource {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  for (const packageName of SPFX_VERSION_PACKAGES) {
    const version = installedVersion(projectRequire, packageName);
    if (version !== undefined) return { kind: 'installed', version, packageName };
  }
  const declared = declaredDependencies(root);
  for (const packageName of SPFX_VERSION_PACKAGES) {
    const range = declared.get(packageName);
    if (range !== undefined) return { kind: 'declared', range, packageName };
  }
  return { kind: 'missing' };
}

function installedVersion(projectRequire: NodeJS.Require, packageName: string): string | undefined {
  try {
    const json = readJsoncFile(projectRequire.resolve(`${packageName}/package.json`));
    return isObject(json) && typeof json.version === 'string' ? json.version : undefined;
  } catch {
    return undefined;
  }
}

function declaredDependencies(root: string): Map<string, string> {
  const result = new Map<string, string>();
  let json: unknown;
  try {
    json = readJsoncFile(path.join(root, 'package.json'));
  } catch {
    return result;
  }
  if (!isObject(json)) return result;
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = json[field];
    if (!isObject(dependencies)) continue;
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range === 'string' && !result.has(name)) result.set(name, range);
    }
  }
  return result;
}

interface MinorVersion {
  major: number;
  minor: number;
}

function parseMinorVersion(version: string): MinorVersion | undefined {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

export function assertSupportedSpfxVersion(
  found: SpfxVersionSource,
  fastServe: { name: string; version: string },
): asserts found is InstalledSpfxVersion {
  const supported = parseMinorVersion(fastServe.version);
  if (!supported) throw new Error(`Cannot parse the ${fastServe.name} version "${fastServe.version}"`);
  const supportedRange = `>=${supported.major}.${supported.minor}.0 <${supported.major}.${supported.minor + 1}.0`;

  if (found.kind === 'missing') {
    throw new Error(
      `This folder is not an SPFx project: none of ${SPFX_VERSION_PACKAGES.join(', ')} is a dependency in package.json. ` +
        `Run fast-serve in the root folder of an SPFx ${supported.major}.${supported.minor}.x project.`,
    );
  }
  if (found.kind === 'declared') {
    throw new Error(
      `${found.packageName} (${found.range}) is listed in package.json but not installed. Install the project dependencies first (npm install).`,
    );
  }

  const projectVersion = parseMinorVersion(found.version);
  if (projectVersion?.major === supported.major && projectVersion.minor === supported.minor) return;
  throw new Error(
    [
      `Unsupported SPFx version: this project uses SPFx ${found.version} (${found.packageName}), ` +
        `but ${fastServe.name} ${fastServe.version} supports SPFx ${supportedRange} only.`,
      `The ${fastServe.name} version follows the SPFx version: use ${fastServe.name}@~X.Y.0 for SPFx X.Y.x.`,
      ...compatibilityHints(projectVersion, supported, fastServe.name),
    ].join('\n'),
  );
}

const LAST_WEBPACK_MINOR = 21;

function compatibilityHints(project: MinorVersion | undefined, supported: MinorVersion, packageName: string): string[] {
  if (!project) return [];
  const installHint = `npm install --save-dev ${packageName}@~${project.major}.${project.minor}.0`;
  if (project.major === 1 && project.minor <= LAST_WEBPACK_MINOR) {
    return [`SPFx ${project.major}.${project.minor} (gulp/webpack) is served by spfx-fast-serve: https://github.com/s-KaiNet/spfx-fast-serve (${installHint}).`];
  }
  if (project.major === supported.major && project.minor < supported.minor) {
    return [`SPFx ${project.major}.${project.minor} is not supported by ${packageName} ${supported.major}.${supported.minor}.x. Upgrade the project to SPFx ${supported.major}.${supported.minor}.`];
  }
  return [`For SPFx ${project.major}.${project.minor}, check for a newer ${packageName} release (${installHint}).`];
}
