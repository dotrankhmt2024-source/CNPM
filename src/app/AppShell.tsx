import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import { homeFor, roleLabel } from '../features/auth/authRoutes';
import { useAuthStore } from '../stores/useAuthStore';
import { useUiStore } from '../stores/useUiStore';
import { useChargingTicker, useCrossTabSync } from '../hooks/useSimulationClock';
import { RedirectNotifier } from '../features/redirect/RedirectNotifier';

interface NavItem {
  to: string;
  label: string;
  /** Chỉ khớp chính xác đường dẫn (dùng cho mục Tổng quan). */
  end?: boolean;
}

const studentNav: NavItem[] = [
  { to: '/student', label: 'Tổng quan', end: true },
  { to: '/student/hub', label: 'Tìm kiếm Hub' },
  { to: '/student/dat-xe', label: 'Đặt xe' },
  { to: '/student/cho-do', label: 'Đặt chỗ đỗ' },
  { to: '/student/dat-sac', label: 'Đặt lịch sạc' },
];

const operatorNav: NavItem[] = [
  { to: '/operator', label: 'Tổng quan', end: true },
  { to: '/operator/hub', label: 'Quản lý HUB' },
  { to: '/operator/dieu-phoi', label: 'Điều phối xe' },
  { to: '/operator/dieu-huong', label: 'Điều hướng người dùng' },
  { to: '/operator/lich-sac', label: 'Lập lịch sạc ưu tiên' },
  { to: '/operator/mo-phong', label: 'Mô phỏng kịch bản' },
];

const navByRole = { student: studentNav, operator: operatorNav };

/** Khung ứng dụng sau đăng nhập: sidebar tối cố định + vùng nội dung sáng. */
export function AppShell() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.currentUser);
  const dark = useUiStore((state) => state.dark);
  const { message } = AntApp.useApp();
  // Xử lý nền cho lịch sạc: hết hạn giữ chỗ, sạc đầy, nhường cổng cho lịch kế tiếp.
  useChargingTicker();
  // Đồng bộ dữ liệu khi mở trang sinh viên và nhà điều hành ở hai tab khác nhau.
  useCrossTabSync();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  if (!user) return <Navigate to="/login" replace />;

  const items = navByRole[user.role];
  const settingsPath = user.role === 'operator' ? '/operator/cai-dat' : '/student/cai-dat';

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#176B5B', borderRadius: 10 },
      }}
    >
      <div className="min-h-screen bg-surface text-ink dark:bg-slate-950 dark:text-slate-100">
        <aside className="fixed inset-y-0 left-0 z-20 flex w-[250px] flex-col overflow-y-auto bg-[#102A43] px-8 py-6">
          <NavLink to={homeFor(user.role)} className="px-1">
            <p className="text-2xl font-bold tracking-tight text-white">SEMH</p>
            <p className="text-[11px] text-[#AFC1D4]">Mobility Management</p>
          </NavLink>

          <div className="mt-6 rounded-lg bg-[#1A3A55] py-2.5 text-center text-sm font-medium text-white">
            {user.role === 'operator' ? 'Đơn vị vận hành' : roleLabel[user.role]}
          </div>

          <nav className="mt-12 flex flex-col gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-3 text-[14px] transition ${
                    isActive
                      ? 'bg-[#176B5B] font-medium text-white'
                      : 'text-[#D4DFE9] hover:bg-white/5'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-1 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => navigate(settingsPath)}
              className="w-full rounded-lg px-1 py-2.5 text-left text-sm text-[#AFC1D4] transition hover:bg-white/5"
            >
              Cài đặt hệ thống
            </button>
            <button
              type="button"
              onClick={() => message.info('Chưa hỗ trợ trong bản demo.')}
              className="w-full rounded-lg px-1 py-2.5 text-left text-sm text-[#AFC1D4] transition hover:bg-white/5"
            >
              Trợ giúp
            </button>
          </div>
        </aside>

        <div className="ml-[250px] min-h-screen p-6 xl:p-8">
          <Outlet />
        </div>
        {/* Đề xuất điều hướng sang Hub thay thế (chỉ hiện với sinh viên) */}
        {user.role === 'student' && <RedirectNotifier />}
      </div>
    </ConfigProvider>
  );
}
