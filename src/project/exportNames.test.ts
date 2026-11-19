import { describe, expect, it } from 'vitest';
import { bundleExportNames } from './exportNames.js';

describe('bundleExportNames', () => {
  it('names components a, b, c… like the SPFx webpack configuration generator', () => {
    expect(bundleExportNames(3)).toEqual(['a', 'b', 'c']);
    expect(bundleExportNames(28).slice(24)).toEqual(['y', 'z', 'aa', 'ab']);
  });

  it('skips JavaScript reserved words', () => {
    const names = bundleExportNames(26 + 26 * 9);
    expect(names).not.toContain('do');
    expect(names).not.toContain('if');
    expect(names).not.toContain('in');
    expect(names[names.indexOf('dn') + 1]).toBe('dp');
  });
});
