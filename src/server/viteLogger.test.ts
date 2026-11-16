import { styleText } from 'node:util';
import { describe, expect, it } from 'vitest';
import { isReasonlessPageRejection } from './viteLogger.js';

describe('isReasonlessPageRejection', () => {
  it('matches the forwarded rejections SharePoint raises without a reason', () => {
    expect(isReasonlessPageRejection(styleText('red', `[Unhandled rejection] ${styleText('bold', 'Unknown Error')}: undefined\n`))).toBe(true);
    expect(isReasonlessPageRejection('[Unhandled rejection] Unknown Error: null')).toBe(true);
  });

  it('keeps real errors', () => {
    expect(isReasonlessPageRejection('[Unhandled rejection] TypeError: x is not a function\n > src/a.ts:1:1')).toBe(false);
    expect(isReasonlessPageRejection('[Unhandled error] Unknown Error: undefined')).toBe(false);
    expect(isReasonlessPageRejection('Internal server error: Transform failed')).toBe(false);
  });
});
