import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { StudentPage } from '../features/student/StudentPage';
import { OperatorPage } from '../features/operator/OperatorPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { homeFor } from '../features/auth/authRoutes';
import { useAuthStore } from '../stores/useAuthStore';
import { AppShell } from './AppShell';

/** Vào "/" thì điều hướng về đúng trang chủ của vai trò, chưa đăng nhập thì ra trang login. */
function HomeRedirect() {
  const currentUser = useAuthStore((state) => state.currentUser);
  return <Navigate to={currentUser ? homeFor(currentUser.role) : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AntApp>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Khu vực yêu cầu đăng nhập */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route element={<ProtectedRoute allow={['student']} />}>
                <Route path="/student" element={<StudentPage />} />
              </Route>
              <Route element={<ProtectedRoute allow={['operator']} />}>
                <Route path="/operator" element={<OperatorPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AntApp>
    </BrowserRouter>
  );
}
