/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import {resolve} from 'path'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  server: {
    port: 3000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  build: {
    rolldownOptions: {
      output: {
        comments: false, // hide comments in bundled output
        keepNames: true, // preserve function/class names used at runtime
      },
    },
  },
  resolve: {
    alias: [
      {find: /^@ui$/, replacement: resolve(__dirname, 'src/ui/index.ts')},
      {find: /^@ui\//, replacement: resolve(__dirname, 'src/ui') + '/'},
      {find: '@browser', replacement: resolve(__dirname, 'src')},
      {find: '@shared', replacement: resolve(__dirname, '../shared/src')},
    ],
  },
})
