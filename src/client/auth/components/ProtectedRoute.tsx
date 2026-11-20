import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homeFor } from '@/client/auth/authRoutes';
import { useAuthStore } from '@/client/api/useAuthStore';
import type { UserRole } from '@/shared/types/auth';

interface ProtectedRouteProps {
  /** Danh sách vai trò được phép vào. Bỏ trống = mọi người dùng đã đăng nhập. */
  allow?: UserRole[];
}

export function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const currentUser = useAuthStore((state) => state.currentUser);
  const location = useLocation();

  if (!currentUser) {
    // Nhớ trang đang muốn vào để đăng nhập xong quay lại đúng chỗ.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allow && !allow.includes(currentUser.role)) {
    return <Navigate to={homeFor(currentUser.role)} replace />;
  }

  return <Outlet />;
}
