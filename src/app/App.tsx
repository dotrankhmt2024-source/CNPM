import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { OperatorDashboardPage } from '../features/operator/OperatorDashboardPage';
import { HubManagementPage } from '../features/operator/HubManagementPage';
import { DispatchPage } from '../features/operator/DispatchPage';
import { RoutingPage } from '../features/operator/RoutingPage';
import { ChargingSchedulePage } from '../features/operator/ChargingSchedulePage';
import { SimulationPage } from '../features/operator/SimulationPage';
import { DashboardPage } from '../features/student/DashboardPage';
import { HubSearchPage } from '../features/student/HubSearchPage';
import { VehicleBookingPage } from '../features/student/VehicleBookingPage';
import { ParkingPage } from '../features/student/ParkingPage';
import { ChargingPage } from '../features/student/ChargingPage';
import { BookingsPage } from '../features/student/BookingsPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { SettingsPage } from '../features/settings/SettingsPage';
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
