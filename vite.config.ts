import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const versionFile = fileURLToPath(new URL('./.build-version', import.meta.url));
let buildNumber = 1;
try {
  buildNumber = parseInt(readFileSync(versionFile, 'utf-8').trim(), 10);
  if (isNaN(buildNumber)) buildNumber = 1;
  buildNumber++;
  writeFileSync(versionFile, String(buildNumber));
} catch {
  // Ignore if version file cannot be updated
}

const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
