// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Any request starting with /api will be forwarded
      '/api': {
        target: 'http://127.0.0.1:8000', // Your FastAPI server address
        changeOrigin: true,
      },
    },
  },
})