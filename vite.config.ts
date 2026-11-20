import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Import tuyệt đối theo gốc `src` (ví dụ `@/subsystems/...`) để việc chia
  // thư mục theo kiến trúc phân lớp không làm vỡ đường dẫn tương đối.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Bỏ qua bản sao lưu trữ trong thư mục dự án và thư mục build.
    exclude: ['**/node_modules/**', '**/dist/**', 'Code BTL CNPM/**'],
  },
});
