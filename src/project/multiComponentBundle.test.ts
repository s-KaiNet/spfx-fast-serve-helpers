import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from './project.js';
import { fixturePath } from '../../test/kit/paths.js';

const root = fixturePath('multi');

describe('bundles with several components', () => {
  it('gives every component of a mixed bundle an export name, the Library component included, like SPFx does', () => {
    const warnings: string[] = [];
    const bundles = createProject(root, { warn: (message) => warnings.push(message) }).bundles();
    const shared = bundles.find((bundle) => bundle.name === 'shared-bundle');
    expect(
      shared?.components.map(({ manifest, exportName, entryFile }) => ({ alias: manifest.alias, exportName, entryFile })),
    ).toEqual([
      { alias: 'FirstWebPart', exportName: 'a', entryFile: path.join(root, 'src/webparts/first/FirstWebPart.ts') },
      { alias: 'BannerApplicationCustomizer', exportName: 'b', entryFile: path.join(root, 'src/extensions/banner/BannerApplicationCustomizer.ts') },
      { alias: 'CardAdaptiveCardExtension', exportName: 'c', entryFile: path.join(root, 'src/adaptiveCardExtensions/card/CardAdaptiveCardExtension.ts') },
      { alias: 'ToolsLibrary', exportName: 'd', entryFile: path.join(root, 'src/libraries/tools/index.ts') },
      { alias: 'SecondWebPart', exportName: 'e', entryFile: path.join(root, 'src/webparts/second/SecondWebPart.ts') },
    ]);
    expect(warnings).toEqual([]);
  });

  it('leaves single-component bundles without an export name', () => {
    const bundles = createProject(root, { warn: () => undefined }).bundles();
    const single = bundles.find((bundle) => bundle.name === 'single-bundle');
    expect(single?.components).toHaveLength(1);
    expect(single?.components[0]).not.toHaveProperty('exportName');
  });
});
