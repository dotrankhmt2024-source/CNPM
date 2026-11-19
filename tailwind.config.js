/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#2563eb',
        // Bảng màu lấy từ frame "Đăng nhập" 
        accent: { DEFAULT: '#0F5D4B', dark: '#0B4A3B', soft: '#E7F0EE' },
        ink: '#0B1220',
        // Sidebar khu vực Nhà điều hành (frame "Trung tâm vận hành")
        navy: { DEFAULT: '#102A43', soft: '#1B3A57' },
        muted: '#667085',
        surface: '#F7F8F9',
        line: '#E4E7EC',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
