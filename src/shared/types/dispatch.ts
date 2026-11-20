/* ============================================================
 * Mô hình dữ liệu cho phân hệ ĐIỀU PHỐI XE giữa các Hub.
 * Trạng thái lệnh bám theo state-chart 4.4 trong báo cáo nhóm:
 *   Khởi tạo → Đã phân công → Đang vận chuyển → Đã hoàn thành
 *   Khởi tạo / Đã phân công → Đã hủy
 * ============================================================ */

export type DispatchStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

/** Một mốc trong lịch sử của lệnh điều phối. */
export interface DispatchEvent {
  at: string;
  status: DispatchStatus;
  actor: string;
  note?: string;
}

/** Nhân viên vận chuyển nhận lệnh điều phối. */
export interface DispatchStaff {
  id: string;
  name: string;
  phone: string;
}

export interface DispatchOrder {
  id: string;
  /** Mã lệnh hiển thị, ví dụ DP-0007. */
  code: string;
  operatorId: string;
  operatorName: string;
  sourceHubId: string;
  destHubId: string;
  quantity: number;
  vehicleIds: string[];
  /** Mã xe (giữ lại để lịch sử vẫn đọc được nếu xe bị xóa khỏi dữ liệu). */
  vehicleCodes: string[];
  status: DispatchStatus;
  staffId?: string;
  staffName?: string;
  note?: string;
  /** Thời gian vận chuyển dự kiến (phút). */
  etaMinutes: number;
  distanceKm: number;
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  expectedArrivalAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  history: DispatchEvent[];
}
