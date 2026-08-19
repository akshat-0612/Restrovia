import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { restaurantMeta } from './vite-restaurant-meta.js';

export default defineConfig({
  plugins: [react(), restaurantMeta()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Dev only — in production VITE_API_URL points straight at the deployed API.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});
