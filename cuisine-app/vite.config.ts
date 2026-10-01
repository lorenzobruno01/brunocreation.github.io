import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// L'application est publiée sur GitHub Pages dans le dossier cuisine/
export default defineConfig({
  base: './', // chemins relatifs : fonctionne quelle que soit l'adresse du site
  plugins: [react()],
  build: {
    outDir: '../cuisine',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
