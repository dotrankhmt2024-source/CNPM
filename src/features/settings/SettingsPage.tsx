import { useState } from 'react';
import { App as AntApp, Button, Switch } from 'antd';
import { Moon, Sun } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useAppStore } from '../../stores/useAppStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUiStore } from '../../stores/useUiStore';
import { roleLabel } from '../auth/authRoutes';

/** Trang "Thông tin cá nhân" và "Cài đặt tài khoản" dùng chung cho cả hai vai trò. */
export function SettingsPage() {
  const { message, modal } = AntApp.useApp();
  const user = useAuthStore((state) => state.currentUser);
  const reset = useAppStore((state) => state.reset);
  const dark = useUiStore((state) => state.dark);
  const toggleDark = useUiStore((state) => state.toggleDark);
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt tài khoản"
        subtitle="Quản lý thông tin cá nhân và tùy chỉnh trải nghiệm HUB & EV."
        eyebrow="Cài đặt"
      />

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Thông tin cá nhân</h2>
            <p className="muted-13 mt-1">Thông tin hiển thị trên tài khoản của bạn.</p>
          </div>
          <Button onClick={() => message.info('Chưa hỗ trợ chỉnh sửa hồ sơ trong bản demo.')}>
            Chỉnh sửa hồ sơ
          </Button>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="muted-13">Họ và tên</p>
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
            <p className="muted-13">Vai trò</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {user ? roleLabel[user.role] : '—'}
            </p>
          </div>
          <div>
            <p className="muted-13">Ngày tạo tài khoản</p>
            <p className="mt-1 text-[15px] font-semibold text-ink dark:text-slate-100">
              {user ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '—'}
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Tùy chọn giao diện</h2>
        <p className="muted-13 mt-1">Chọn giao diện phù hợp với mỗi môi trường sử dụng của bạn.</p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#2563EB] dark:bg-slate-900">
              <Moon size={18} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-ink dark:text-slate-100">
                Chế độ hiển thị
              </p>
              <p className="muted-13">Áp dụng cho toàn bộ giao diện của hệ thống.</p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex rounded-lg border border-line p-1 dark:border-slate-700">
              <button
                type="button"
                onClick={() => dark && toggleDark()}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-medium transition ${
                  dark ? 'text-muted dark:text-slate-400' : 'bg-[#2563EB] text-white'
                }`}
              >
                <Sun size={14} />
                Sáng
              </button>
              <button
                type="button"
                onClick={() => !dark && toggleDark()}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-medium transition ${
                  dark ? 'bg-[#2563EB] text-white' : 'text-muted dark:text-slate-400'
                }`}
              >
                <Moon size={14} />
                Tối
              </button>
            </div>
            <p className="mt-2 text-[12px] font-medium text-[#2563EB]">
              Đang chọn: Giao diện {dark ? 'tối' : 'sáng'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Bảo mật</h2>
          <p className="muted-13 mt-1">Giữ tài khoản của bạn an toàn.</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink dark:text-slate-100">Mật khẩu</p>
              <p className="muted-13">Cập nhật lần gần nhất: chưa có dữ liệu</p>
            </div>
            <Button onClick={() => message.info('Chưa hỗ trợ đổi mật khẩu trong bản demo.')}>
              Đổi mật khẩu
            </Button>
          </div>
        </section>

        <section className="card">
          <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Thông báo</h2>
          <p className="muted-13 mt-1">Quản lý cách bạn nhận cập nhật.</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink dark:text-slate-100">
                Thông báo đặt xe và lịch sạc
              </p>
              <p className="muted-13">Nhận thông báo về các hoạt động quan trọng.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={notifications ? 'pill-green' : 'pill-orange'}>
                {notifications ? 'Đang bật' : 'Đang tắt'}
              </span>
              <Switch checked={notifications} onChange={setNotifications} size="small" />
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="text-[17px] font-bold text-ink dark:text-slate-100">Dữ liệu demo</h2>
        <p className="muted-13 mt-1">
          Khôi phục toàn bộ dữ liệu mô phỏng (Hub, xe, lượt đặt) về trạng thái ban đầu.
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
                onOk: () => {
                  reset();
                  message.success('Đã khôi phục dữ liệu demo.');
                },
              })
            }
          >
            Khôi phục dữ liệu demo
          </Button>
        </div>
      </section>
    </div>
  );
}
