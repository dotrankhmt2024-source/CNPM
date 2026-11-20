/**
 * Hook đọc dữ liệu của riêng tài khoản đang đăng nhập.
 *
 * Mỗi sinh viên chỉ thấy lượt đặt xe / chỗ đỗ / lịch sạc của chính mình; dữ liệu của
 * tài khoản khác vẫn nằm trong DataStore (nhà điều hành nhìn thấy toàn bộ) nhưng không
 * lộ sang màn hình của người khác.
 */
import { useMemo } from 'react';
import { useAppStore } from '@/client/api/useAppStore';
import { useAuthStore } from '@/client/api/useAuthStore';

export function useCurrentStudentId() {
  return useAuthStore((state) => state.currentUser?.id);
}

export function useMyBookings() {
  const studentId = useCurrentStudentId();
  const bookings = useAppStore((state) => state.bookings);
  return useMemo(
    () => (studentId ? bookings.filter((booking) => booking.studentId === studentId) : []),
    [bookings, studentId],
  );
}

export function useMyParkingReservations() {
  const studentId = useCurrentStudentId();
  const reservations = useAppStore((state) => state.parkingReservations);
  return useMemo(
    () => (studentId ? reservations.filter((item) => item.studentId === studentId) : []),
    [reservations, studentId],
  );
}

export function useMyChargingBookings() {
  const studentId = useCurrentStudentId();
  const bookings = useAppStore((state) => state.chargingBookings);
  return useMemo(
    () => (studentId ? bookings.filter((booking) => booking.studentId === studentId) : []),
    [bookings, studentId],
  );
}
