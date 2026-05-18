import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const viteCacheRoot = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? process.env.TEMP ?? os.tmpdir()
const viteCacheDir = path.join(viteCacheRoot, 'SuitableRMS', 'vite-cache', 'desktop')

export default defineConfig({
  cacheDir: viteCacheDir,
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  build: {
    outDir: 'dist-desktop-web',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'desktop.html'),
    },
  },
})
