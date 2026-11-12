import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { App as AntApp, Button, ConfigProvider, Tag, theme } from 'antd';
import {
  Activity,
  Bike,
  LogOut,
  Moon,
  RotateCcw,
  Sun,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { useAuthStore } from '../stores/useAuthStore';
import { homeFor, roleLabel } from '../features/auth/authRoutes';
import type { UserRole } from '../types/auth';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const links: NavItem[] = [
  { to: '/student', label: 'Sinh viên', icon: Bike, roles: ['student'] },
  { to: '/operator', label: 'Nhà điều hành', icon: Activity, roles: ['operator'] },
];

/** Khung ứng dụng sau khi đăng nhập: header (nav theo vai trò, đổi theme, đăng xuất) + nội dung. */
export function AppShell() {
  const navigate = useNavigate();
  const { modal } = AntApp.useApp();
  const user = useAuthStore((state) => state.currentUser);
  const logout = useAuthStore((state) => state.logout);
  const reset = useAppStore((state) => state.reset);
  const [dark, setDark] = useState(() => localStorage.getItem('demo-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('demo-theme', dark ? 'dark' : 'light');
  }, [dark]);

  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const visibleLinks = links.filter((link) => link.roles.includes(user.role));

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#2563eb', borderRadius: 10 },
      }}
    >
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 dark:border-slate-700 dark:bg-slate-900/95">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
              <NavLink to={homeFor(user.role)} className="mr-auto flex items-center gap-2 font-bold">
                <Zap className="text-blue-600" /> Smart E-Mobility Hub
                <span className="rounded bg-blue-100 px-2 py-1 text-xs font-normal text-blue-700">
                  MVP DEMO
                </span>
              </NavLink>

              <nav className="flex gap-2">
                {visibleLinks.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-1 rounded-lg px-3 py-2 text-sm ${
                        isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`
                    }
                  >
                    <Icon size={16} />
                    {label}
                  </NavLink>
                ))}
              </nav>

              <span className="hidden items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:flex">
                <UserRound size={16} />
                {user.fullName}
                <Tag className="mr-0">{roleLabel[user.role]}</Tag>
              </span>

              <Button
                icon={dark ? <Sun size={16} /> : <Moon size={16} />}
                onClick={() => setDark((value) => !value)}
              >
                {dark ? 'Sáng' : 'Tối'}
              </Button>
              <Button
                icon={<RotateCcw size={16} />}
                onClick={() =>
                  modal.confirm({
                    title: 'Khôi phục dữ liệu demo?',
                    content: 'Mọi thay đổi đã lưu trong trình duyệt sẽ bị xóa.',
                    okText: 'Khôi phục',
                    cancelText: 'Hủy',
                    onOk: reset,
                  })
                }
              >
                Reset
              </Button>
              <Button icon={<LogOut size={16} />} onClick={handleLogout}>
                Đăng xuất
              </Button>
            </div>
          </header>

          <main className="mx-auto max-w-7xl p-4 md:p-7">
            <Outlet />
          </main>

          <footer className="py-6 text-center text-xs text-slate-400">
            Frontend-only prototype · dữ liệu giả lập · không kết nối thiết bị IoT
          </footer>
        </div>
    </ConfigProvider>
  );
}
