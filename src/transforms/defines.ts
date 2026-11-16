import type { Plugin } from 'vite';

export function definesPlugin(): Plugin {
  return {
    name: 'fast-serve:defines',
    config: () => ({
      define: {
        DEBUG: 'true',
        'process.env.NODE_ENV': JSON.stringify('development'),
      },
    }),
  };
}
