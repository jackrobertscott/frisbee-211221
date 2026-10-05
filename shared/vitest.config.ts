import {resolve} from 'path'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
