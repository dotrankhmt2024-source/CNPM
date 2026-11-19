import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Dropdown, theme } from 'antd';
import {
  BatteryCharging,
  Building2,
  ChevronDown,
  CircleHelp,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  RotateCcw,
  Route as RouteIcon,
  Settings,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppStore } from '../../stores/useAppStore';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Thứ tự và tên menu lấy theo frame "Trung tâm vận hành" trên Figma. */
const nav: NavItem[] = [
  { to: '/operator', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/operator/hubs', label: 'Quản lý HUB', icon: Building2 },
  { to: '/operator/dispatch', label: 'Điều phối xe', icon: Truck },
  { to: '/operator/redirect', label: 'Điều hướng người dùng', icon: RouteIcon },
  { to: '/operator/charging', label: 'Lập lịch sạc ưu tiên', icon: BatteryCharging },
  { to: '/operator/simulation', label: 'Mô phỏng kịch bản', icon: FlaskConical },
];

export function OperatorLayout() {
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const user = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const reset = useAppStore((s) => s.reset);

  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#0F5D4B',
          colorInfo: '#0F5D4B',
          colorLink: '#0F5D4B',
          colorText: '#0B1220',
          borderRadius: 10,
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        },
      }}
    >
      <div className="min-h-screen bg-[#F5F7FA] font-sans text-ink lg:flex">
        <aside className="flex shrink-0 flex-col bg-navy text-slate-300 lg:sticky lg:top-0 lg:h-screen lg:w-60">
          <div className="px-6 pb-3 pt-6 lg:pb-5">
            <p className="text-2xl font-extrabold leading-none text-white">SEMH</p>
            <p className="mt-1 text-[11px] text-slate-400">Mobility Management</p>
          </div>

          <div className="hidden px-5 lg:block">
            <div className="rounded-lg bg-navy-soft py-2 text-center text-xs font-semibold text-slate-100">
              Đơn vị vận hành
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-8 lg:flex-col lg:gap-2 lg:overflow-visible lg:pb-0">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-[15px] transition-colors ${
                    isActive ? 'bg-accent font-semibold text-white' : 'hover:bg-navy-soft hover:text-white'
                  }`
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto hidden border-t border-white/10 px-3 py-4 lg:block">
            <button
              type="button"
              onClick={() => message.info('Cài đặt hệ thống: chưa hỗ trợ trong bản demo')}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] hover:bg-navy-soft hover:text-white"
            >
              <Settings size={17} /> Cài đặt hệ thống
            </button>
            <button
              type="button"
              onClick={() => message.info('Trợ giúp: chưa hỗ trợ trong bản demo')}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] hover:bg-navy-soft hover:text-white"
            >
              <CircleHelp size={17} /> Trợ giúp
            </button>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 p-5 lg:p-8">
          <div className="mb-4 flex justify-end lg:absolute lg:right-8 lg:top-6 lg:mb-0">
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'reset', icon: <RotateCcw size={14} />, label: 'Khôi phục dữ liệu demo' },
                  { key: 'logout', icon: <LogOut size={14} />, label: 'Đăng xuất', danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'logout') handleLogout();
                  if (key === 'reset') {
                    modal.confirm({
                      title: 'Khôi phục dữ liệu demo?',
                      content: 'Mọi thay đổi đã lưu trong trình duyệt sẽ bị xóa.',
                      okText: 'Khôi phục',
                      cancelText: 'Hủy',
                      onOk: reset,
                    });
                  }
                },
              }}
            >
              <button type="button" className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 text-left shadow-sm">
                <span>
                  <span className="block text-sm font-bold leading-tight">{user.fullName}</span>
                  <span className="block text-[11px] text-muted">Admin</span>
                </span>
                <ChevronDown size={16} className="text-muted" />
              </button>
            </Dropdown>
          </div>
          <Outlet />
        </main>
      </div>
    </ConfigProvider>
  );
}
