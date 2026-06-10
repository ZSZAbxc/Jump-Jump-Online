import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    allowedHosts: ['jump-jump-online.onrender.com', '.onrender.com'],
  },
  build: {
    outDir: 'dist',
  },
});
