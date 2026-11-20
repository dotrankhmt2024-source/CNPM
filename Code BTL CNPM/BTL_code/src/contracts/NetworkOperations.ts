/**
 * Hợp đồng của subsystem NetworkOperations: giám sát, điều phối xe, mô phỏng và lập lịch.
 */
import type {
  AppData,
  ChargePoint,
  ChargingBooking,
  ChargingConfig,
  ChargingEndReason,
  ChargingRequest,
  DispatchOrder,
  DispatchStaff,
  Hub,
  HubStatus,
  Incident,
  PriorityBreakdown,
  Vehicle,
} from '@/shared/types/domain';
import type { ApiResult, OperationResult } from './common';
import type { SensorReading, SensorStatus } from './Platform';

/** Phần state nghiệp vụ sạc mà SchedulingService thao tác. */
export type ChargingState = Pick<
  AppData,
  | 'hubs'
  | 'vehicles'
  | 'bookings'
  | 'chargePoints'
  | 'chargingBookings'
  | 'chargingSessions'
  | 'chargingRequests'
  | 'chargingConfig'
>;

/* ------------------------------- Giám sát ------------------------------- */

export interface HubHealth {
  hub: Hub;
  occupancyRate: number;
  freeParking: number;
  freeChargers: number;
  availableVehicles: number;
  sensorStatus: SensorStatus;
  warnings: string[];
}

export interface IMonitoring {
  listHubs(): Hub[];
  hub(hubId: string): Hub | null;
  incidents(): Incident[];
  vehicles(hubId?: string): Vehicle[];
  /** Tổng hợp trạng thái Hub từ dữ liệu vận hành + số đo cảm biến. */
  health(): HubHealth[];
  updateHubStatus(hubId: string, status: HubStatus): OperationResult;
  resolveIncident(incidentId: string): OperationResult;
  readings(hubId?: string): SensorReading[];
}

/* ------------------------------- Điều phối ------------------------------ */

export interface DispatchRequest {
  sourceHubId: string;
  destHubId: string;
  quantity: number;
  vehicleIds?: string[];
  staffId?: string;
  note?: string;
}

export interface DispatchSuggestion {
  from: Hub;
  to: Hub;
  quantity: number;
  reason: string;
}

export interface IDispatch {
  list(): DispatchOrder[];
  staff(): DispatchStaff[];
  createOrder(input: DispatchRequest): ApiResult<{ order?: DispatchOrder; warning?: string | null }>;
  assignStaff(orderId: string, staffId: string): OperationResult;
  startTransport(orderId: string): OperationResult;
  complete(orderId: string): OperationResult;
  cancel(orderId: string, reason: string): OperationResult;
  suggestRebalancing(): DispatchSuggestion[];
}

/* ------------------------------ Lập lịch sạc ---------------------------- */

/** Một yêu cầu sạc đã được chấm điểm ưu tiên (kết quả prioritizeVehicles). */
export interface RankedChargingRequest {
  request: ChargingRequest;
  vehicle?: Vehicle;
  battery: number;
  score: number;
  breakdown: PriorityBreakdown;
  waitedMinutes: number;
  minutesToNextUse: number | null;
  /** Xe đang ở Hub và rảnh để cắm sạc. */
  eligible: boolean;
  reason?: string;
}

/** Cổng có thể cấp điện ngay và hạn phải trả cổng (lịch đặt kế tiếp). */
export interface FreeChargingPort {
  port: ChargePoint;
  windowEnd: number | null;
}

/** Thông tin các xe vượt quá công suất sạc hiện tại của Hub. */
export interface ChargingOverflowInfo {
  hasOverflow: boolean;
  items: (RankedChargingRequest & { waitMinutes: number | null })[];
  alternatives: { hub: Hub; freePorts: number }[];
}

export interface ChargingReservationRequest {
  studentId: string;
  studentName: string;
  hubId: string;
  portId: string;
  vehicleKind: 'shared' | 'personal';
  vehicleId: string;
  vehicleLabel: string;
  vehicleType: 'bike' | 'motorbike' | 'car';
  batteryCapacityKwh: number;
  currentBattery: number;
  targetBattery: number;
  dateKey: string;
  startTime: string;
  durationMinutes?: number;
  price?: number;
}

/** Trạng thái một cổng sạc trong một khoảng thời gian cụ thể. */
export interface PortWindowState {
  port: ChargePoint;
  status: 'free' | 'reserved' | 'used' | 'maintenance';
}

/** Yêu cầu đặt lịch sạc do sinh viên gửi lên (gateway tự điền thông tin tài khoản). */
export type ChargingSlotRequest = Omit<ChargingReservationRequest, 'studentId' | 'studentName'>;

export interface IScheduling {
  now(): number;
  createReservation(input: ChargingReservationRequest): ApiResult<{ reservation?: ChargingBooking }>;
  cancelReservation(reservationId: string): OperationResult;
  checkIn(code: string, studentId?: string): OperationResult;
  /** Sinh viên tự lấy chỗ sạc bằng mã (cho phép check-in sớm tại cổng). */
  checkInStudent(code: string, studentId: string): OperationResult;
  /** Sinh viên trả chỗ sạc bằng mã — kết thúc phiên và giải phóng cổng. */
  checkOutStudent(code: string, studentId: string): OperationResult;
  completeSession(sessionId: string, reason?: ChargingEndReason): OperationResult;
  requestCharging(
    vehicleId: string,
    options?: { source?: 'student' | 'operator'; targetBattery?: number; neededBy?: string; note?: string },
  ): OperationResult;
  cancelRequest(requestId: string): OperationResult;
  createSmartSchedule(hubId: string): ApiResult<{ allocated?: number; overflow?: number }>;
  allocatePower(hubId: string): OperationResult & { allocated?: number; overflow?: number };
  setPortMaintenance(portId: string, underMaintenance: boolean): OperationResult;
  updateConfig(patch: Partial<ChargingConfig>): OperationResult;
  /** Chạy định kỳ: quá hạn giữ chỗ, nhường cổng, đánh dấu sạc đầy. */
  tick(): string[];
  advanceClock(minutes: number): string[];
  resetClock(): void;
  ports(): ChargePoint[];
  queue(): ChargingRequest[];
  bookings(): ChargingBooking[];
  /** Ảnh chụp state sạc tại thời điểm gọi (dữ liệu thuần, không ghi ngược). */
  bookingState(): ChargingState;
  /** Hàng đợi đã chấm điểm ưu tiên của một Hub. */
  priorityQueue(hubId: string): RankedChargingRequest[];
  /** Các cổng có thể cấp điện ngay. */
  freePorts(hubId: string): FreeChargingPort[];
  /** Xe vượt công suất + Hub thay thế còn cổng trống. */
  queueOverflow(hubId: string): ChargingOverflowInfo;
  /** Trạng thái từng cổng của Hub trong khoảng [start, end) — dùng cho màn hình đặt lịch. */
  portStates(hubId: string, start: number, end: number): PortWindowState[];
}

/* ------------------------------- Mô phỏng ------------------------------- */

export interface ScenarioParams {
  /** Hệ số tăng nhu cầu, ví dụ 1.2 = +20%. */
  demandGrowth: number;
  /** Số sinh viên đến mỗi Hub trong kịch bản. */
  arrivals: number;
}

export interface DemandProjection {
  hubId: string;
  name: string;
  current: number;
  projected: number;
  capacity: number;
  warning: boolean;
}

export interface ISimulation {
  project(input: ScenarioParams): DemandProjection[];
}
