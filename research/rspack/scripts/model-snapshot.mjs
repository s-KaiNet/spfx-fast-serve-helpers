import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [libDir, projectRoot, outFile, heftConfigFile] = process.argv.slice(2);
if (!libDir || !projectRoot) {
  console.error('usage: node model-snapshot.mjs <fast-serve lib dir> <project root> [snapshot.json] [heft-webpack-config.json]');
  process.exit(2);
}

const { createProject } = await import(pathToFileURL(path.join(libDir, 'project/index.js')).href);
const root = path.resolve(projectRoot);
const warnings = [];
const project = createProject(root, { warn: (message) => warnings.push(message) });
const relative = (file) => path.relative(root, file).split(path.sep).join('/');

const model = {
  bundles: project.bundles().map((bundle) => ({
    name: bundle.name,
    components: bundle.components.map(({ manifest, entryFile, exportName }) => ({
      alias: manifest.alias,
      id: manifest.id,
      componentType: manifest.componentType,
      extensionType: manifest.extensionType,
      version: manifest.version,
      entry: relative(entryFile),
      exportName,
    })),
  })),
  libraries: Object.fromEntries([...project.libraries()].map(([name, { id, version }]) => [name, { id, version }]).sort(([a], [b]) => a.localeCompare(b))),
  configExternals: [...project.configExternals().keys()],
  localizedResources: Object.fromEntries([...project.localizedResources('en-us')].map(([name, { file }]) => [name, relative(file)])),
  serveConfigurations: Object.keys(project.serveConfig().serveConfigurations ?? {}),
  initialPage: project.serveConfig().initialPage,
  port: project.serveConfig().port,
  warnings,
};
if (outFile) writeFileSync(outFile, JSON.stringify(model, null, 2) + '\n');

const problems = [];
const notes = new Set();
const distDir = path.join(root, 'dist');
const heftManifests = existsSync(distDir)
  ? readdirSync(distDir)
      .filter((file) => file.endsWith('.manifest.json'))
      .map((file) => JSON.parse(readFileSync(path.join(distDir, file), 'utf8')))
  : [];
if (heftManifests.length === 0) problems.push('no heft manifests in dist/ to compare with (run heft build first)');

const components = new Map(model.bundles.flatMap((bundle) => bundle.components.map((component) => [component.id, { ...component, bundle: bundle.name }])));
const BUNDLED_ON_PURPOSE = new Set(['react', 'react-dom', 'react-dom/client']);
for (const manifest of heftManifests) {
  const ours = components.get(manifest.id);
  if (!ours) {
    problems.push(`${manifest.alias}: in heft output, not in the model`);
    continue;
  }
  const { entryModuleId, exportName, scriptResources } = manifest.loaderConfig;
  if (ours.bundle !== entryModuleId) problems.push(`${manifest.alias}: bundle ${ours.bundle}, heft ${entryModuleId}`);
  if (ours.exportName !== exportName) problems.push(`${manifest.alias}: export ${ours.exportName}, heft ${exportName}`);
  if (ours.version !== manifest.version) problems.push(`${manifest.alias}: version ${ours.version}, heft ${manifest.version}`);
  for (const [name, resource] of Object.entries(scriptResources)) {
    if (resource.type !== 'component') continue;
    const library = model.libraries[name];
    if (BUNDLED_ON_PURPOSE.has(name)) notes.add(`${name}: an SPFx library component in heft's manifests, bundled by fast-serve on purpose (development React for Fast Refresh)`);
    else if (!library) problems.push(`${manifest.alias}: heft library ${name} missing in the model`);
    else if (library.id !== resource.id || library.version !== resource.version) problems.push(`${name}: ${library.id}@${library.version}, heft ${resource.id}@${resource.version}`);
  }
}
for (const component of components.values()) {
  if (!heftManifests.some((manifest) => manifest.id === component.id)) problems.push(`${component.alias}: in the model, not in heft output`);
}

if (heftConfigFile) {
  const parsed = JSON.parse(readFileSync(heftConfigFile, 'utf8'));
  const heftConfig = Array.isArray(parsed) ? parsed[0] : parsed;
  const entries = Object.keys(heftConfig.entry).sort();
  const bundles = model.bundles.map((bundle) => bundle.name).sort();
  if (JSON.stringify(entries) !== JSON.stringify(bundles)) problems.push(`entries ${bundles.join(',')}, heft ${entries.join(',')}`);
  for (const external of heftConfig.externals) {
    if (typeof external !== 'string') continue;
    if (model.libraries[external] || model.localizedResources[external] || model.configExternals.includes(external)) continue;
    if (BUNDLED_ON_PURPOSE.has(external)) continue;
    problems.push(`heft external ${external} is neither an SPFx library, a localized resource nor a config.json external in the model`);
  }
}

console.log(`${relative(root) || root}: ${model.bundles.length} bundles, ${components.size} components, ${Object.keys(model.libraries).length} SPFx libraries, ${heftManifests.length} heft manifests`);
for (const note of notes) console.log(`note: ${note}`);
for (const problem of problems) console.log(`MISMATCH: ${problem}`);
process.exitCode = problems.length > 0 ? 1 : 0;
