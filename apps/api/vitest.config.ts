import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS dependency injection relies on decorator metadata, which the default
// transformer does not emit, so tests are compiled with SWC.
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        plugins,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
