import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { AuthLayout } from '../components/AuthLayout';
import { LoginForm, type LoginFormValues } from '../components/LoginForm';
import { homeFor } from '../authRoutes';
import { useAuthStore } from '../../../stores/useAuthStore';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const currentUser = useAuthStore((state) => state.currentUser);
  const login = useAuthStore((state) => state.login);

  // Đã đăng nhập thì không cần xem lại trang login.
  if (currentUser) return <Navigate to={homeFor(currentUser.role)} replace />;

  const handleLogin = ({ email, password, remember }: LoginFormValues) => {
    const result = login({ email, password }, { remember });
    if (!result.ok) return result.message;

    message.success(`Chào mừng ${result.user.fullName}!`);
    // Quay lại trang vừa bị chặn (nếu có), ngược lại về trang chủ theo vai trò.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? homeFor(result.user.role), { replace: true });
    return null;
  };

  return (
    <AuthLayout>
      <h1 className="text-[32px] font-bold leading-[1.15] tracking-tight">
        Chào mừng bạn trở lại
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        Đăng nhập để quản lý các lịch đặt và dịch vụ HUB.
      </p>

      <div className="mt-9">
        <LoginForm
          onSubmit={handleLogin}
          onForgotPassword={() => message.info('Bản demo chưa hỗ trợ khôi phục mật khẩu.')}
        />
      </div>

      <p className="mt-7 text-[13px] text-ink">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="font-semibold text-accent hover:text-accent-dark">
          Đăng ký ngay
        </Link>
      </p>

      {import.meta.env.DEV && (
        <div className="mt-10 rounded-xl border border-line bg-white/70 p-4 text-xs leading-relaxed text-muted">
          <p className="mb-1 font-semibold text-ink">Tài khoản demo (chỉ hiện ở môi trường dev)</p>
          <p>student@demo.local · Student123!</p>
          <p>operator@demo.local · Operator123!</p>
        </div>
      )}
    </AuthLayout>
  );
}
