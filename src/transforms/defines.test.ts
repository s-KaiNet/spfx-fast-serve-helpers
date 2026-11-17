import type { UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { definesPlugin } from './defines.js';

describe('defines plugin', () => {
  it('defines DEBUG and the development NODE_ENV like an SPFx debug build', () => {
    const { define } = (definesPlugin().config as () => UserConfig)();
    expect(define).toEqual({ DEBUG: 'true', 'process.env.NODE_ENV': '"development"' });
  });
});
