import { describe, expect, it } from 'vitest';
import { overlayContent } from './events.js';
import type { TypeCheckResult } from './issues.js';
import { otherCheckerName } from './plugin.js';

const failing: TypeCheckResult = { errors: 1, warnings: 0, summary: 'type check: 1 error', blocks: ['type error in src/a.ts:1:1\nTS2304: Cannot find name x.'] };
const clean: TypeCheckResult = { errors: 0, warnings: 0, summary: 'type check: no errors', blocks: [] };

describe('type check events', () => {
  it('send overlay content only while there are issues', () => {
    expect(overlayContent(failing)).toEqual({ title: 'Type check: 1 error', text: failing.blocks[0] });
    expect(overlayContent(clean)).toBeUndefined();
  });

  it('recognize a type checker plugin brought by the extend file', () => {
    class TsCheckerRspackPlugin {
      readonly options = { async: true };
    }
    class ForkTsCheckerWebpackPlugin {
      readonly options = { async: false };
    }
    expect(otherCheckerName([undefined, false, { apply: () => undefined }, new TsCheckerRspackPlugin()])).toBe('TsCheckerRspackPlugin');
    expect(otherCheckerName([new ForkTsCheckerWebpackPlugin()])).toBe('ForkTsCheckerWebpackPlugin');
    expect(otherCheckerName([{ apply: () => undefined }])).toBeUndefined();
  });
});
