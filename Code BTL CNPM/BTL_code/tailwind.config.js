/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#2563eb',
        // Bảng màu lấy từ frame "Đăng nhập" trên Figma
        accent: { DEFAULT: '#0F5D4B', dark: '#0B4A3B', soft: '#E7F0EE' },
        sidebar: '#102A43',
        sidebarMuted: '#1A3A55',
        
        ink: '#0B1220',
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
