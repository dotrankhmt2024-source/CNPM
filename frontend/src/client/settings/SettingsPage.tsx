import { AppearanceOptions } from './components/AppearanceOptions';
import { useTranslation } from '@/client/shared/i18n';
import { useState } from 'react';
import { App as AntApp, Button, Switch } from 'antd';
import { Moon, Sun } from 'lucide-react';
import { PageHeader } from '@/client/shared/components/PageHeader';
import { useAppStore } from '@/client/api/useAppStore';
import { useAuthStore } from '@/client/api/useAuthStore';
import { useUiStore } from '@/client/shared/state/useUiStore';
import { roleLabel } from '@/client/auth/authRoutes';

/** Trang "Thông tin cá nhân" và "Cài đặt tài khoản" dùng chung cho cả hai vai trò. */
export function SettingsPage() {
  const t = useTranslation();
  const selectedTheme = useUiStore(s => s.theme);
  const setTheme = useUiStore(s => s.setTheme);
  const language = useUiStore(s => s.language);
  const { message, modal } = AntApp.useApp();
  const user = useAuthStore((state) => state.currentUser);
  const reset = useAppStore((state) => state.reset);
  const dark = useUiStore((state) => state.dark);

  // Thiết lập cá nhân lưu trên trình duyệt (backend chưa có API thiết lập riêng).
  const [notifications, setNotifications] = useState(() => {
    try {
      return localStorage.getItem('semh.notifications') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleNotifications = (enabled: boolean) => {
    setNotifications(enabled);
    try {
      localStorage.setItem('semh.notifications', enabled ? 'on' : 'off');
    } catch {
      /* trình duyệt chặn localStorage */
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Cài đặt tài khoản', 'Account settings')}
        subtitle={t('Quản lý thông tin cá nhân và tùy chỉnh trải nghiệm HUB & EV.', 'Manage your profile and appearance preferences.')}
        eyebrow={t('Cài đặt', 'Settings')}
      />

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">{t('Thông tin cá nhân', 'Profile')}</h2>
            <p className="muted-13 mt-1">{t('Thông tin hiển thị trên tài khoản của bạn.', 'Your account information.')}</p>
          </div>
          <Button onClick={() => message.info('Chưa hỗ trợ chỉnh sửa hồ sơ trong bản demo.')}>
            {t('Chỉnh sửa hồ sơ', 'Edit profile')}
          </Button>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="muted-13">{t('Họ và tên', 'Full name')}</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {user?.fullName ?? '—'}
            </p>
          </div>
          <div>
            <p className="muted-13">Email</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {user?.email ?? '—'}
            </p>
          </div>
          <div>
            <p className="muted-13">{t('Vai trò', 'Role')}</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {user ? roleLabel[user.role] : '—'}
            </p>
          </div>
          <div>
            <p className="muted-13">{t('Ngày tạo tài khoản', 'Created on')}</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {user ? new Date(user.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '—'}
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">{t('Tùy chọn giao diện', 'Appearance')}</h2>
        <p className="muted-13 mt-1">{t('Chọn giao diện phù hợp với mỗi môi trường sử dụng của bạn.', 'Choose the appearance that suits your environment.')}</p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#2563EB] dark:bg-slate-900">
              <Moon size={18} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                {t('Chế độ hiển thị', 'Display mode')}
              </p>
              <p className="muted-13">{t('Áp dụng cho toàn bộ giao diện của hệ thống.', 'Applies across the application.')}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex rounded-lg border border-line p-1 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-medium transition ${
                  dark ? 'text-muted dark:text-slate-400' : 'bg-[#2563EB] text-white'
                }`}
              >
                <Sun size={14} />
                {t('Sáng', 'Light')}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-medium transition ${
                  dark ? 'bg-[#2563EB] text-white' : 'text-muted dark:text-slate-400'
                }`}
              >
                <Moon size={14} />
                {t('Tối', 'Dark')}
              </button>
            </div>
            <p className="mt-2 text-[12px] font-medium text-[#2563EB]">
              {t('Đang chọn:', 'Selected:')} {selectedTheme === 'system' ? t('Tự động', 'System') : dark ? t('Tối', 'Dark') : t('Sáng', 'Light')}
            </p>
          </div>
        </div>
        <AppearanceOptions />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">{t('Bảo mật', 'Security')}</h2>
          <p className="muted-13 mt-1">{t('Giữ tài khoản của bạn an toàn.', 'Keep your account safe.')}</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink dark:text-slate-100">{t('Mật khẩu', 'Password')}</p>
              <p className="muted-13">{t('Cập nhật lần gần nhất: chưa có dữ liệu', 'Last updated: unavailable')}</p>
            </div>
            <Button onClick={() => message.info('Chưa hỗ trợ đổi mật khẩu trong bản demo.')}>
              {t('Đổi mật khẩu', 'Change password')}
            </Button>
          </div>
        </section>

        <section className="card">
          <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">{t('Thông báo', 'Notifications')}</h2>
          <p className="muted-13 mt-1">{t('Quản lý cách bạn nhận cập nhật.', 'Manage your updates.')}</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink dark:text-slate-100">
                {t('Thông báo đặt xe và lịch sạc', 'Booking and charging notifications')}
              </p>
              <p className="muted-13">{t('Nhận thông báo về các hoạt động quan trọng.', 'Receive important activity updates.')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={notifications ? 'pill-green' : 'pill-orange'}>
                {notifications ? 'Đang bật' : 'Đang tắt'}
              </span>
              <Switch checked={notifications} onChange={toggleNotifications} size="small" />
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">{t('Dữ liệu demo', 'Demo data')}</h2>
        <p className="muted-13 mt-1">
          {t('Khôi phục toàn bộ dữ liệu mô phỏng (Hub, xe, lượt đặt) về trạng thái ban đầu.', 'Restore demo data to its initial state.')}
        </p>
        <div className="mt-4">
          <Button
            danger
            onClick={() =>
              modal.confirm({
                title: 'Khôi phục dữ liệu demo?',
                content: 'Mọi thay đổi đã lưu trong trình duyệt sẽ bị xóa.',
                okText: 'Khôi phục',
                cancelText: 'Hủy',
                onOk: async () => {
                  await reset();
                  message.success('Đã khôi phục dữ liệu demo.');
                },
              })
            }
          >
            {t('Khôi phục dữ liệu demo', 'Reset demo data')}
          </Button>
        </div>
      </section>
    </div>
  );
}
