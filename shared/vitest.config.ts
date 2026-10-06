import {resolve} from 'path'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    coverage: {
      include: ['src/**'],
      exclude: ['src/**/*.test.ts'],
    },
    include: ['src/**/*.test.ts'],
  },
})
