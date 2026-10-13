import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
