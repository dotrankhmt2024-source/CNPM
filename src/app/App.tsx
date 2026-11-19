import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { StudentPage } from '../features/student/StudentPage';
import { OperatorLayout } from '../features/operator/OperatorLayout';
import { OverviewPage } from '../features/operator/pages/OverviewPage';
import { HubManagementPage } from '../features/operator/pages/HubManagementPage';
import { DispatchPage } from '../features/operator/pages/DispatchPage';
import { RedirectPage } from '../features/operator/pages/RedirectPage';
import { ChargingPage } from '../features/operator/pages/ChargingPage';
import { ChargingParamsPage } from '../features/operator/pages/ChargingParamsPage';
import { SimulationPage } from '../features/operator/pages/SimulationPage';
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
            </Route>

            {/* Khu vực Nhà điều hành: dùng khung sidebar riêng (OperatorLayout) */}
            <Route element={<ProtectedRoute allow={['operator']} />}>
              <Route path="/operator" element={<OperatorLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="hubs" element={<HubManagementPage />} />
                <Route path="dispatch" element={<DispatchPage />} />
                <Route path="redirect" element={<RedirectPage />} />
                <Route path="charging" element={<ChargingPage />} />
                <Route path="charging/params" element={<ChargingParamsPage />} />
                <Route path="simulation" element={<SimulationPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AntApp>
    </BrowserRouter>
  );
}
