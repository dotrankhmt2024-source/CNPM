import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { OperatorDashboardPage } from '@/client/operator/OperatorDashboardPage';
import { HubManagementPage } from '@/client/operator/HubManagementPage';
import { DispatchPage } from '@/client/operator/DispatchPage';
import { RoutingPage } from '@/client/operator/RoutingPage';
import { ChargingSchedulePage } from '@/client/operator/ChargingSchedulePage';
import { SimulationPage } from '@/client/operator/SimulationPage';
import { DashboardPage } from '@/client/student/DashboardPage';
import { HubSearchPage } from '@/client/student/HubSearchPage';
import { VehicleBookingPage } from '@/client/student/VehicleBookingPage';
import { ParkingPage } from '@/client/student/ParkingPage';
import { ChargingPage } from '@/client/student/ChargingPage';
import { BookingsPage } from '@/client/student/BookingsPage';
import { LoginPage } from '@/client/auth/pages/LoginPage';
import { RegisterPage } from '@/client/auth/pages/RegisterPage';
import { SettingsPage } from '@/client/settings/SettingsPage';
import { ProtectedRoute } from '@/client/auth/components/ProtectedRoute';
import { homeFor } from '@/client/auth/authRoutes';
import { useAuthStore } from '@/client/api/useAuthStore';
import { AppShell } from '@/app/AppShell';

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
                <Route path="/student" element={<DashboardPage />} />
                <Route path="/student/hub" element={<HubSearchPage />} />
                <Route path="/student/dat-xe" element={<VehicleBookingPage />} />
                <Route path="/student/cho-do" element={<ParkingPage />} />
                <Route path="/student/dat-sac" element={<ChargingPage />} />
                <Route path="/student/lich-cua-toi" element={<BookingsPage />} />
                <Route path="/student/cai-dat" element={<SettingsPage />} />
              </Route>

              <Route element={<ProtectedRoute allow={['operator']} />}>
                <Route path="/operator" element={<OperatorDashboardPage />} />
                <Route path="/operator/hub" element={<HubManagementPage />} />
                <Route path="/operator/dieu-phoi" element={<DispatchPage />} />
                <Route path="/operator/dieu-huong" element={<RoutingPage />} />
                <Route path="/operator/lich-sac" element={<ChargingSchedulePage />} />
                <Route path="/operator/mo-phong" element={<SimulationPage />} />
                <Route path="/operator/cai-dat" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AntApp>
    </BrowserRouter>
  );
}
