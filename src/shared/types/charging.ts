/* ============================================================
 * Mô hình dữ liệu cho phân hệ SẠC:
 *  - Đặt lịch sạc theo khung giờ (ChargingBooking)
 *  - Lập lịch sạc thông minh ưu tiên (ChargingRequest = phần tử hàng đợi ưu tiên)
 *  - Phiên sạc (ChargingSession) và hoàn tất phiên sạc
 * Tên lớp/thuộc tính bám theo Class diagram mục 3.4, 3.5 trong báo cáo nhóm.
 * ============================================================ */

/** Loại đầu nối của cổng sạc (mockup: "AC 60kW", "AC 120kW"). */
export type ConnectorType = 'AC' | 'DC';

/**
 * Trạng thái hiển thị của cổng sạc tại thời điểm hiện tại
 * (state-chart 4.2: Khả dụng / Đã giữ chỗ / Đang sạc / Ngừng cấp điện / Bảo trì).
 *  - free:      khả dụng
 *  - reserved:  đang trong khung giờ của một lịch đặt, chờ check-in (đã giữ chỗ)
 *  - used:      đang cấp điện cho một phiên sạc
 *  - full:      pin đã đạt mức mục tiêu, ngừng cấp điện, chờ rút sạc
 *  - maintenance: bảo trì / báo lỗi
 * Giá trị này được hệ thống tự tính lại (syncChargingState) — không sửa tay.
 */
export type ChargePointStatus = 'free' | 'reserved' | 'used' | 'full' | 'maintenance';

export interface ChargePoint {
  id: string;
  /** Mã cổng hiển thị, ví dụ CS-01. */
  code: string;
  hubId: string;
  /** Công suất tối đa (kW). */
  power: number;
  connector: ConnectorType;
  zone: string;
  /** Cổng đang bảo trì (do Operator bật/tắt). */
  underMaintenance: boolean;
  status: ChargePointStatus;
}

/** Loại phương tiện tham gia sạc. */
export type ChargeVehicleKind = 'shared' | 'personal';
export type PersonalVehicleType = 'bike' | 'motorbike' | 'car';

/** Trạng thái lịch đặt sạc (state-chart 4.3 — phiên giữ chỗ). */
export type ChargingBookingStatus =
  | 'CONFIRMED' // Khởi tạo: đã giữ khung giờ, chờ check-in
  | 'CHECKED_IN' // Đang hiệu lực: đã check-in, phiên sạc đang chạy
  | 'COMPLETED' // Kết thúc
  | 'CANCELLED' // Sinh viên hủy
  | 'EXPIRED'; // Quá thời gian giữ chỗ mà không check-in (bỏ chỗ)

export interface ChargingBooking {
  id: string;
  /** Mã xác nhận / mã check-in (QR). */
  code: string;
  studentId: string;
  studentName: string;
  hubId: string;
  portId: string;
  portCode: string;
  vehicleKind: ChargeVehicleKind;
  /** Xe dùng chung: id trong bảng vehicles; xe cá nhân: biển số / mã xe. */
  vehicleId: string;
  vehicleLabel: string;
  batteryCapacityKwh: number;
  currentBattery: number;
  targetBattery: number;
  /** Ngày sạc (YYYY-MM-DD, giờ địa phương). */
  date: string;
  /** Giờ bắt đầu dạng HH:mm (giữ lại cho các màn hình cũ). */
  startTime: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  power: number;
  estimatedEnergyKwh: number;
  /** Phí dự kiến khi đặt. */
  price: number;
  priorityScore: number;
  status: ChargingBookingStatus;
  createdAt: string;
  checkedInAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  completedAt?: string;
  sessionId?: string;
  /** Ghi chú hệ thống (ví dụ: tự chuyển sang cổng khác do bảo trì). */
  note?: string;
}

/** Nguồn gốc một yêu cầu trong hàng đợi sạc ưu tiên. */
export type ChargingRequestSource = 'auto' | 'student' | 'operator';

/**
 * Một phần tử trong hàng đợi sạc ưu tiên (PriorityChargingQueue) của một Hub.
 * Giữ tên ChargingRequest để tương thích với các màn hình khác đang dùng.
 */
export interface ChargingRequest {
  id: string;
  vehicleId: string;
  hubId: string;
  /** Điểm ưu tiên tại lần tính gần nhất (0–100+). */
  priority: number;
  status: 'queued' | 'charging' | 'completed' | 'cancelled';
  /** Giờ dự kiến được cấp điện (HH:mm) nếu đã xác định. */
  scheduledAt?: string;
  source: ChargingRequestSource;
  batteryAtRequest: number;
  targetBattery: number;
  requestedAt: string;
  /** Thời điểm xe cần được dùng (lịch sử dụng sắp tới) — tăng điểm ưu tiên khi gần đến. */
  neededBy?: string;
  sessionId?: string;
  note?: string;
}

export type ChargingSessionStatus = 'CHARGING' | 'FULL' | 'COMPLETED';
export type ChargingEndReason =
  | 'user_stop' // người dùng rút sạc / dừng sớm
  | 'operator_stop' // operator kết thúc phiên
  | 'full' // đã đầy, rút sạc
  | 'preempted' // phải nhường cổng cho lịch đặt kế tiếp
  | 'max_duration' // vượt thời lượng sạc tối đa
  | 'port_fault'; // cổng sạc chuyển sang bảo trì

/** Phiên sạc (class ChargingSession). */
export interface ChargingSession {
  id: string;
  hubId: string;
  portId: string;
  portCode: string;
  vehicleKind: ChargeVehicleKind;
  vehicleId: string;
  vehicleLabel: string;
  ownerName: string;
  reservationId?: string;
  requestId?: string;
  batteryCapacityKwh: number;
  /** Công suất thực tế được cấp (kW). */
  powerKw: number;
  startBattery: number;
  targetBattery: number;
  startedAt: string;
  /** Thời điểm dự kiến đạt targetBattery. */
  expectedFullAt: string;
  /** Hạn chót phải giải phóng cổng (lịch đặt kế tiếp / thời lượng tối đa). */
  mustEndBy?: string;
  status: ChargingSessionStatus;
  fullAt?: string;
  endedAt?: string;
  endBattery?: number;
  energyKwh?: number;
  cost?: number;
  endReason?: ChargingEndReason;
}

/** Các thành phần cấu thành điểm ưu tiên sạc (dùng cho hiển thị và kiểm thử). */
export interface PriorityBreakdown {
  /** (100 − pin) × 0,6 → tối đa 60 điểm. */
  battery: number;
  /** +15 nếu pin ≤ ngưỡng nguy cấp. */
  critical: number;
  /** Tối đa +25 nếu xe cần dùng trong cửa sổ thời gian (càng gần càng cao). */
  upcoming: number;
  /** +10 cho xe dùng chung (phục vụ nhiều người). */
  shared: number;
  /** +1 điểm cho mỗi 6 phút chờ, tối đa +10 (chống "đói" hàng đợi). */
  waiting: number;
}

/** Tham số lập lịch sạc (class ChargingParameterConfig). */
export interface ChargingConfig {
  /** Ngưỡng pin thấp: xe dùng chung dưới ngưỡng tự vào hàng đợi (%). */
  lowBatteryThreshold: number;
  /** Ngưỡng pin nguy cấp: cộng thêm điểm ưu tiên (%). */
  criticalBatteryThreshold: number;
  /** Mức pin mục tiêu mặc định khi sạc (%). */
  defaultTargetBattery: number;
  /** Cửa sổ thời gian xét "sắp có chuyến đi" (phút). */
  timeWindowMinutes: number;
  /** Độ dài một khung giờ đặt lịch (phút). */
  slotMinutes: number;
  /** Thời lượng sạc tối đa của một phiên (phút). */
  maxSessionMinutes: number;
  /** Thời gian giữ chỗ sau giờ bắt đầu trước khi tự hủy (phút). */
  holdMinutes: number;
  /** Cho phép check-in sớm trước giờ bắt đầu (phút). */
  earlyCheckInMinutes: number;
  /** Giờ mở / đóng cửa nhận lịch sạc. */
  openHour: number;
  closeHour: number;
  /** Đơn giá điện (đ/kWh) và phí đặt chỗ (đ). */
  pricePerKwh: number;
  bookingFee: number;
  /** Tự động cấp điện cho xe kế tiếp trong hàng đợi khi có cổng trống. */
  autoAllocate: boolean;
  updatedAt: string;
}
