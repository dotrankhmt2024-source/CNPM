import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Build riêng cho backend: đóng gói `backend/main.ts` thành một file JS chạy bằng Node.
 *
 * Dùng Vite/esbuild để:
 *  - resolve alias `@/…` giống phía frontend,
 *  - giữ nguyên các module Node built-in (`node:http`, `node:sqlite`, …) ở dạng external.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@/app', replacement: at('./frontend/src/app') },
      { find: '@/client', replacement: at('./frontend/src/client') },
      { find: '@/gateway', replacement: at('./frontend/src/gateway') },
      { find: '@/subsystems', replacement: at('./core/subsystems') },
      { find: '@/shared', replacement: at('./core/shared') },
      { find: '@/contracts', replacement: at('./core/contracts') },
      { find: '@/demo', replacement: at('./core/demo') },
    ],
  },
  build: {
    ssr: true,
    target: 'node20',
    outDir: '.server-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./backend/main.ts', import.meta.url)),
      output: {
        entryFileNames: 'server.js',
        format: 'es',
      },
    },
  },
});
