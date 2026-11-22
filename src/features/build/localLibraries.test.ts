import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { copyCompileFixture, copyLibraryFixture, evaluateAmd, fakeExternals, LIBRARY_PACKAGE, type FixtureCopy, type LibraryCopy } from '../../../test/kit/compileKit.js';

const HEFT_PACKAGES = ['@microsoft/sp-css-loader', 'sass-embedded'];
const WEB_PART = 'src/webparts/hello/HelloWebPart.ts';

const consumerWebPart = `import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { CorpLibrary, Badge } from '${LIBRARY_PACKAGE}';
import { legacyChart } from '${LIBRARY_PACKAGE}/lib/legacy';

export default class HelloWebPart extends BaseClientSideWebPart {
  public readonly greeting: string = new CorpLibrary().greet('anna');
  public readonly badge: unknown = Badge();
  public readonly chart: unknown = legacyChart;
}
`;

interface LibraryWebPart {
  greeting: string;
  badge: { type: string; props: { className: string } };
  chart: unknown;
}

const copies: { remove(): void }[] = [];

afterEach(() => {
  for (const copy of copies.splice(0)) copy.remove();
});

function consumerWithLibrary(libraryFiles: Record<string, string | object> = {}, consumerFiles: Record<string, string | object> = {}): { consumer: FixtureCopy; library: LibraryCopy } {
  const library = copyLibraryFixture(libraryFiles);
  const consumer = copyCompileFixture({ [WEB_PART]: consumerWebPart, ...consumerFiles });
  copies.push(consumer, library);
  for (const name of HEFT_PACKAGES) consumer.linkPackage(name);
  consumer.linkLocalPackage(LIBRARY_PACKAGE, library.root);
  return { consumer, library };
}

describe('local SPFx library projects compiled from source', () => {
  it('bundles the library src with its loc strings, tsconfig paths and styles instead of loading it from SharePoint', async () => {
    const { consumer, library } = consumerWithLibrary();
    const { result, messages, bundle } = await consumer.compile();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    const source = bundle('single-web-part');
    const corpLegacy = { chart: 'legacy chart' };
    const { dependencies, exports } = evaluateAmd(source, { ...fakeExternals, 'corp-legacy': corpLegacy }, { document: undefined });
    expect(dependencies).not.toContain(LIBRARY_PACKAGE);
    expect(dependencies).toContain('corp-legacy');
    const WebPart = exports.default as new () => LibraryWebPart;
    const webPart = new WebPart();
    expect(webPart.greeting).toBe('Hello from the library, ANNA');
    expect(webPart.badge.type).toBe('span');
    expect(webPart.badge.props.className).toMatch(/^badge_[0-9a-f]{8}$/);
    expect(webPart.chart).toBe('legacy chart');
    expect(result.fileDependencies).toContain(`${library.root}/src/components/Badge.tsx`);
    expect(result.fileDependencies).not.toContain(`${library.root}/lib/index.js`);
    expect(messages).toContain(
      `warn: ${LIBRARY_PACKAGE}: its tsconfig compiles classes differently (experimentalDecorators: true in the library, false in the project); fast-serve compiles the library's src with the project's settings`,
    );
  });

  it('adds React Fast Refresh to library components', async () => {
    const { consumer, library } = consumerWithLibrary();
    await consumer.compile();
    const source = readFileSync(`${consumer.root}/out/single-web-part.js`, 'utf8');
    const badgeModule = source.slice(source.indexOf(`${library.root.split('/').at(-1) ?? ''}/src/components/Badge.tsx`));
    expect(badgeModule).toContain('$RefreshReg$');
  });

  it('reports library const enums declared only in .d.ts files with paths from the project', async () => {
    const { consumer } = consumerWithLibrary({
      'src/enums.d.ts': 'declare const enum CorpLevel {\n  High = 1,\n}\n',
      'src/shared/format.ts': 'export function formatName(name: string): string {\n  return name.toUpperCase() + CorpLevel.High;\n}\n',
    });
    const { result } = await consumer.compile();
    expect(result.errors.join('\n')).toMatch(/ \.\.\/fast-serve-library-\w+\/corp-lib\/src\/shared\/format\.ts uses const enums that are only declared in \.d\.ts files/);
    expect(result.errors.join('\n')).toMatch(/CorpLevel: a global `declare const enum` in \.\.\/fast-serve-library-\w+\/corp-lib\/src\/enums\.d\.ts/);
  });

  it('loads an opted-out library from SharePoint', async () => {
    const { consumer } = consumerWithLibrary({}, { [WEB_PART]: `import { CorpLibrary } from '${LIBRARY_PACKAGE}';\nexport default CorpLibrary;\n` });
    const { result, bundle } = await consumer.compile('en-us', { deployedLibraries: [LIBRARY_PACKAGE] });
    expect(result.errors).toEqual([]);
    expect(evaluateAmd(bundle('single-web-part'), { [LIBRARY_PACKAGE]: { CorpLibrary: 'deployed' } }).dependencies).toContain(LIBRARY_PACKAGE);
  });
});
