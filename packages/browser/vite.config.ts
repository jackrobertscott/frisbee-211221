import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'
/**
 *
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      torva: 'node_modules/torva/lib/index.js',
    },
  },
})
