import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// L'application est publiée sur GitHub Pages sous /cuisine/
export default defineConfig({
  base: '/cuisine/',
  plugins: [react()],
  build: {
    outDir: '../cuisine',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
