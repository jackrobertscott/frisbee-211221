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
  build: {
    rolldownOptions: {
      output: {
        comments: false, // hide comments in bundled output
        keepNames: true, // preserve function/class names used at runtime
      },
    },
  },
  resolve: {
    alias: {
      '@browser': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
})
