import { Link, Navigate, useNavigate } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { AuthLayout } from '@/client/auth/components/AuthLayout';
import { RegisterForm } from '@/client/auth/components/RegisterForm';
import { homeFor } from '@/client/auth/authRoutes';
import { useAuthStore } from '@/client/api/useAuthStore';
import type { RegisterData } from '@/shared/types/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const currentUser = useAuthStore((state) => state.currentUser);
  const register = useAuthStore((state) => state.register);

  if (currentUser) return <Navigate to={homeFor(currentUser.role)} replace />;

  const handleRegister = (values: RegisterData) => {
    const result = register(values);
    if (!result.ok) return result.message;

    message.success('Tạo tài khoản thành công!');
    navigate(homeFor(result.user.role), { replace: true });
    return null;
  };

  return (
    <AuthLayout>
      <h1 className="text-[30px] font-bold leading-[1.15] tracking-tight sm:text-[34px]">
        Tạo tài khoản
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Đăng ký để đặt xe và sử dụng các dịch vụ của HUB.
      </p>

      <div className="mt-9">
        <RegisterForm onSubmit={handleRegister} />
      </div>

      <p className="mt-8 text-[13px] text-ink">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-semibold text-accent hover:text-accent-dark">
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  );
}
