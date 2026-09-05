import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
// GitHub Pages is static: simulation runs entirely in the browser.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'docs', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
