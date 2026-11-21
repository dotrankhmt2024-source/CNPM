import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  /*
   * Mã nguồn chia làm ba nhóm thư mục:
   *  - `frontend/src` : giao diện (app, client, gateway) — chạy trong trình duyệt
   *  - `core`         : lõi nghiệp vụ dùng chung (subsystems, shared, contracts, demo)
   *  - `backend`      : HTTP server + SQLite — chạy trong Node
   * Alias giữ nguyên tiền tố `@/…` quen thuộc cho cả ba nhóm.
   */
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
  // Khi dev, frontend gọi `/api/*` và Vite chuyển tiếp sang backend (cổng 4000).
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Bỏ qua bản sao lưu trữ trong thư mục dự án và thư mục build.
    exclude: ['**/node_modules/**', '**/dist/**', 'Code BTL CNPM/**'],
  },
});
