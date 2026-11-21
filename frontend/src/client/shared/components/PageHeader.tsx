import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Modal, Popover } from 'antd';
import { ChevronDown, LogOut } from 'lucide-react';
import { roleLabel } from '@/client/auth/authRoutes';
import { useAuthStore } from '@/client/api/useAuthStore';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Nhãn nhỏ phía trên tiêu đề, ví dụ "Cài đặt". */
  eyebrow?: string;
  /** Nút hành động đặt cạnh khối tài khoản (tuỳ chọn). */
  actions?: ReactNode;
}

/**
 * Đầu trang dùng chung: tiêu đề + phụ đề bên trái, khối tài khoản bên phải.
 * Menu tài khoản: Thông tin cá nhân, Cài đặt tài khoản, Đăng xuất (có hộp thoại xác nhận).
 */
export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.currentUser);
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const settingsPath = location.pathname.startsWith('/operator')
    ? '/operator/cai-dat'
    : '/student/cai-dat';

  const goToSettings = () => {
    setOpen(false);
    navigate(settingsPath);
  };

  const content = (
    <div className="w-[280px]">
      <div className="px-4 py-3">
        <p className="text-[14px] font-semibold text-ink dark:text-slate-100">
          {user?.fullName ?? 'Khách'}
        </p>
        <p className="mt-0.5 text-[12px] text-muted dark:text-slate-400">{user?.email}</p>
      </div>
      <div className="border-t border-line dark:border-slate-800" />
      <button
        type="button"
        onClick={goToSettings}
        className="block w-full px-4 py-2.5 text-left text-[13px] text-ink transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Thông tin cá nhân
      </button>
      <button
        type="button"
        onClick={goToSettings}
        className="block w-full px-4 py-2.5 text-left text-[13px] text-ink transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Cài đặt tài khoản
      </button>
      <div className="border-t border-line dark:border-slate-800" />
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setLogoutOpen(true);
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        <LogOut size={15} />
        Đăng xuất
      </button>
    </div>
  );

  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2563EB]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink dark:text-slate-100">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted dark:text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {actions}
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          styles={{ body: { padding: 0 } }}
          content={content}
        >
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2 text-left shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900"
          >
            <span>
              <span className="block text-[13px] font-semibold leading-tight text-ink dark:text-slate-100">
                {user?.fullName ?? 'Khách'}
              </span>
              <span className="block text-[11px] text-muted dark:text-slate-400">
                {user ? roleLabel[user.role] : ''}
              </span>
            </span>
            <ChevronDown size={16} className="text-muted" />
          </button>
        </Popover>
      </div>

      <Modal
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        footer={null}
        centered
        width={420}
      >
        <h3 className="text-[18px] font-bold text-ink dark:text-slate-100">Đăng xuất?</h3>
        <p className="mt-2 text-[14px] text-muted dark:text-slate-400">
          Bạn có chắc muốn đăng xuất khỏi tài khoản này?
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => setLogoutOpen(false)}>Ở lại</Button>
          <Button
            type="primary"
            danger
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </Modal>
    </div>
  );
}
