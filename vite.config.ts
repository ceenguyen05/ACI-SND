import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false, proxy: { '/online': { target: 'http://127.0.0.1:3001', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
