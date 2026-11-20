import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
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
});
