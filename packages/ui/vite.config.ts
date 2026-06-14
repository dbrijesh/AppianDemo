import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/identity': { target: 'http://localhost:8003', changeOrigin: true, rewrite: p => p.replace(/^\/api\/identity/, '') },
      '/api/workflow':  { target: 'http://localhost:8004', changeOrigin: true, rewrite: p => p.replace(/^\/api\/workflow/, '') },
      '/api/tasks':     { target: 'http://localhost:8005', changeOrigin: true, rewrite: p => p.replace(/^\/api\/tasks/, '') },
      '/api/audit':     { target: 'http://localhost:8001', changeOrigin: true, rewrite: p => p.replace(/^\/api\/audit/, '') },
      '/api/agents':    { target: 'http://localhost:8006', changeOrigin: true, rewrite: p => p.replace(/^\/api\/agents/, '') },
      '/api/esign':     { target: 'http://localhost:8002', changeOrigin: true, rewrite: p => p.replace(/^\/api\/esign/, '') },
      '/api/llm':       { target: 'http://localhost:8007', changeOrigin: true, rewrite: p => p.replace(/^\/api\/llm/, '') },
    },
  },
  build: { outDir: 'dist' },
})
