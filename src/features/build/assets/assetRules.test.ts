import { afterEach, describe, expect, it } from 'vitest';
import { copyCompileFixture, evaluateAmd, type FixtureCopy } from '../../../../test/kit/compileKit.js';
import { ASSET_EXTENSIONS } from './index.js';

const WEB_PART = 'src/webparts/hello/HelloWebPart.ts';

const copies: FixtureCopy[] = [];

afterEach(() => {
  for (const copy of copies.splice(0)) copy.remove();
});

describe('asset rules like heft 1.23', () => {
  it('emits a .sprite.svg as a file URL', async () => {
    const copy = copyCompileFixture({
      'src/webparts/hello/assets/icons.sprite.svg': '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a"/></svg>',
      [WEB_PART]: [
        "import sprite from './assets/icons.sprite.svg';",
        '',
        'export default class HelloWebPart {',
        '  public readonly sprite: string = sprite;',
        '}',
        '',
      ].join('\n'),
    });
    copies.push(copy);

    const { result, bundle } = await copy.compile();

    expect(result.errors).toEqual([]);
    const WebPart = evaluateAmd(bundle('single-web-part')).exports.default as new () => { sprite: string };
    expect(new WebPart().sprite).toMatch(/\/dist\/icons\.sprite_[0-9a-f]+\.svg$/);
    expect(result.assets.some((asset) => /^icons\.sprite_[0-9a-f]+\.svg$/.test(asset))).toBe(true);
  }, 60_000);

  it('handles the file types of heft 1.23', () => {
    expect(ASSET_EXTENSIONS).not.toContain('zip');
    expect(ASSET_EXTENSIONS).toEqual(expect.arrayContaining(['jpg', 'png', 'woff', 'woff2', 'eot', 'ttf', 'svg', 'gif', 'dds', 'cur', 'webp', 'mp4']));
  });
});
