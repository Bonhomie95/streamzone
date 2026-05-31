import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Rewrite /api/proxy → /api and /api/status stays as-is
        rewrite: (path) => path.replace(/^\/api\/proxy/, '/api'),
      },
    },
  },
})
