import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En dev le front et l'API sont sur deux ports : on proxifie pour rester
    // en same-origin. En prod c'est VITE_API_URL + le CORS de l'API qui jouent.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
