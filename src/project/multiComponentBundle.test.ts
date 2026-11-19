import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProject } from './project.js';

const root = fileURLToPath(new URL('../../test/fixtures/multi', import.meta.url));

describe('bundles with several components', () => {
  it('gives web parts, extensions and Adaptive Card Extensions in one bundle export names, counting unsupported components like SPFx does', () => {
    const warnings: string[] = [];
    const bundles = createProject(root, { warn: (message) => warnings.push(message) }).bundles();
    const shared = bundles.find((bundle) => bundle.name === 'shared-bundle');
    expect(
      shared?.components.map(({ manifest, exportName, entryFile }) => ({ alias: manifest.alias, exportName, entryFile })),
    ).toEqual([
      { alias: 'FirstWebPart', exportName: 'a', entryFile: path.join(root, 'src/webparts/first/FirstWebPart.ts') },
      { alias: 'BannerApplicationCustomizer', exportName: 'b', entryFile: path.join(root, 'src/extensions/banner/BannerApplicationCustomizer.ts') },
      { alias: 'CardAdaptiveCardExtension', exportName: 'c', entryFile: path.join(root, 'src/adaptiveCardExtensions/card/CardAdaptiveCardExtension.ts') },
      { alias: 'SecondWebPart', exportName: 'e', entryFile: path.join(root, 'src/webparts/second/SecondWebPart.ts') },
    ]);
    expect(warnings).toEqual(['ToolsLibrary: componentType "Library" is not supported yet, skipped']);
  });

  it('leaves single-component bundles without an export name', () => {
    const bundles = createProject(root, { warn: () => undefined }).bundles();
    const single = bundles.find((bundle) => bundle.name === 'single-bundle');
    expect(single?.components).toHaveLength(1);
    expect(single?.components[0]).not.toHaveProperty('exportName');
  });
});
