import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,  // bind to 0.0.0.0 — reachable from phone over local network
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
