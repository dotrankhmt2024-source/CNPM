/**
 * DataStore — nguồn lưu trữ dữ liệu của hệ thống (thay cho database trong bản demo).
 *
 * Chỉ tầng Platform biết dữ liệu được giữ trong bộ nhớ và đồng bộ xuống localStorage.
 * Các subsystem nghiệp vụ chỉ nhìn thấy IDataSource / IPersistence.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createInitialData } from '@/demo/seed';
import type { IDataSource } from '@/contracts/Platform';
import type { AppData } from '@/shared/types/domain';

/** Giữ nguyên khoá lưu trữ để dữ liệu demo của người dùng cũ vẫn đọc được. */
export const STORAGE_KEY = 'smart-emobility-demo-v7';

/**
 * Chủ sở hữu mặc định của dữ liệu tạo trước khi có phân quyền theo tài khoản.
 * (Các lượt đặt cũ trong localStorage được gán về tài khoản demo.)
 */
const LEGACY_OWNER_ID = 'student-001';

export const appDataStore = create<AppData>()(
  persist(() => createInitialData(), {
    name: STORAGE_KEY,
    /**
     * Dữ liệu demo đổi mô hình: số vị trí đỗ sinh theo sức chứa của Hub, bỏ bảng
     * cổng sạc riêng, `occupiedParking` tính cả vị trí bảo trì, mỗi lượt đặt có
     * `studentId` (tách dữ liệu giữa các tài khoản) và `studentName` (để nhà điều
     * hành biết vị trí đang do ai giữ / ai đang đỗ).
     */
    version: 5,
    migrate: (persisted, version) => {
      const state = (persisted as { state?: AppData } | undefined)?.state;
      if (!state || version < 3) return createInitialData();
      // v3/v4 → v5: bổ sung chủ sở hữu và tên người đặt cho dữ liệu cũ.
      return {
        ...state,
        bookings: (state.bookings ?? []).map((booking) => {
          const studentId = booking.studentId ?? LEGACY_OWNER_ID;
          return {
            ...booking,
            studentId,
            studentName: booking.studentName ?? (studentId === LEGACY_OWNER_ID ? 'Sinh viên Demo' : 'Sinh viên'),
          };
        }),
        parkingReservations: (state.parkingReservations ?? []).map((reservation) => {
          const studentId = reservation.studentId ?? LEGACY_OWNER_ID;
          return {
            ...reservation,
            studentId,
            studentName:
              reservation.studentName ?? (studentId === LEGACY_OWNER_ID ? 'Sinh viên Demo' : 'Sinh viên'),
          };
        }),
      } as AppData;
    },
  }),
);

/**
 * Hai tab (sinh viên và nhà điều hành) dùng chung một localStorage nhưng mỗi tab có
 * bản sao state riêng. Lắng nghe sự kiện `storage` để tab còn lại cập nhật ngay khi
 * tab kia đặt chỗ / đặt lịch sạc, không cần tải lại trang.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as { state?: AppData };
      if (!parsed.state) return;
      if (JSON.stringify(parsed.state) === JSON.stringify(appDataStore.getState())) return;
      appDataStore.setState(parsed.state);
    } catch {
      // Bản ghi hỏng thì bỏ qua, giữ nguyên dữ liệu đang có.
    }
  });
}

/** Cài đặt IDataSource trên nguồn dữ liệu thật của bản demo. */
export class LocalDataSource implements IDataSource {
  read(): AppData {
    return appDataStore.getState();
  }

  write(patch: Partial<AppData>): void {
    appDataStore.setState(patch);
  }

  replaceAll(data: AppData): void {
    appDataStore.setState(data, true);
  }

  subscribe(listener: (data: AppData) => void): () => void {
    return appDataStore.subscribe((state) => listener(state));
  }
}
