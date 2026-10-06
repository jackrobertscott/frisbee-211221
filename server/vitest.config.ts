import {resolve} from 'path'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@server': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
  test: {
    coverage: {
      include: ['src/**'],
      exclude: ['src/**/*.test.ts'],
    },
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
})
