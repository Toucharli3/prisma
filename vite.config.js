import { defineConfig } from 'vite';

// base: './' => le build fonctionne aussi bien servi à la racine qu'en sous-dossier
// ou ouvert directement depuis le disque (file://).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    open: true,
  },
});
