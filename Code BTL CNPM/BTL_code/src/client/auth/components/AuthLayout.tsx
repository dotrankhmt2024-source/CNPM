import type { ReactNode } from 'react';
import { ConfigProvider, theme } from 'antd';

/**
 * Khung chung cho trang Đăng nhập: cột ảnh bên trái, cột nội dung bên phải.
 *
 * Ảnh hero: thả file export từ Figma vào `public/login-hero.jpg`.
 * Nếu chưa có file, lớp gradient bên dưới sẽ hiển thị thay thế (không bị vỡ layout).
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        // Trang auth luôn sáng theo thiết kế, kể cả khi app đang ở dark mode.
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#0F5D4B',
          colorInfo: '#0F5D4B',
          colorLink: '#0F5D4B',
          colorText: '#0B1220',
          colorTextPlaceholder: '#98A2B3',
          colorBorder: '#E5E7EB',
          borderRadius: 8,
          controlHeight: 40,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        },
      }}
    >
      <div className="min-h-screen bg-surface font-sans text-ink lg:grid lg:grid-cols-[42%_1fr]">
          <aside
            aria-hidden="true"
            className="relative hidden bg-cover bg-center lg:block"
            style={{
              backgroundImage:
                "url('/login-hero.jpg'), radial-gradient(120% 120% at 20% 0%, #12604C 0%, #0B3A33 55%, #071F1B 100%)",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          </aside>

          <main className="flex min-h-screen flex-col px-6 py-10 sm:px-10 lg:px-10 lg:py-16">
            <div className="mx-auto w-full max-w-[540px] lg:mx-0">
              <header>
                <p className="text-base font-extrabold tracking-tight">SMART E-MOBILITY HUB - SEMH</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Quản lý hub và xe điện
                </p>
              </header>

              <div className="mt-12 lg:mt-16">{children}</div>
            </div>
          </main>
        </div>
    </ConfigProvider>
  );
}
