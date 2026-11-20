/**
 * SchedulingService — component của subsystem NetworkOperations.
 *
 * Cài đặt IScheduling trên nền bộ hàm thuần `scheduling/chargingScheduler`:
 *  - đặt / huỷ lịch sạc theo khung giờ, check-in, kết thúc phiên sạc;
 *  - hàng đợi ưu tiên và cấp điện theo điểm ưu tiên;
 *  - bảo trì cổng và nhịp xử lý định kỳ (quá hạn giữ chỗ, nhường cổng).
 *
 * Service chỉ lo đọc/ghi dữ liệu và thời gian; toàn bộ quy tắc nằm ở module thuần
 * nên vẫn kiểm thử được mà không cần React.
 */
import type {
  ChargingOverflowInfo,
  ChargingReservationRequest,
  ChargingState,
  FreeChargingPort,
  IScheduling,
  PortWindowState,
  RankedChargingRequest,
} from '@/contracts/NetworkOperations';
import type { ApiResult, IClock, IPersistence, OperationResult } from '@/contracts';
import type {
  AppData,
  ChargePoint,
  ChargingBooking,
  ChargingConfig,
  ChargingEndReason,
  ChargingRequest,
} from '@/shared/types/domain';
import {
  allocateChargingPower,
  cancelChargingRequest,
  cancelChargingReservation,
  completeChargingSession,
  createChargingReservation,
  createSmartChargingSchedule,
  getFreePortsNow,
  getPortStateInWindow,
  pickChargingState,
  prioritizeVehicles,
  processQueueOverflow,
  requestCharging,
  runChargingTick,
  setPortMaintenance,
  syncChargingState,
  validateCheckIn,
  type ReservationInput,
} from './scheduling/chargingScheduler';

/** Kiểm tra tham số cấu hình sạc (ChargingParameterConfig.updateConfig). */
function validateConfig(config: ChargingConfig): string | null {
  const percent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
  if (
    !percent(config.lowBatteryThreshold) ||
    !percent(config.criticalBatteryThreshold) ||
    !percent(config.defaultTargetBattery)
  ) {
    return 'Các ngưỡng pin phải nằm trong khoảng 0–100%.';
  }
  if (config.criticalBatteryThreshold > config.lowBatteryThreshold) {
    return 'Ngưỡng pin nguy cấp phải nhỏ hơn hoặc bằng ngưỡng pin thấp.';
  }
  if (config.defaultTargetBattery <= config.lowBatteryThreshold) {
    return 'Mức pin mục tiêu phải lớn hơn ngưỡng pin thấp.';
  }
  const positiveInt = (value: number) => Number.isInteger(value) && value > 0;
  if (
    ![config.timeWindowMinutes, config.slotMinutes, config.maxSessionMinutes, config.holdMinutes].every(
      positiveInt,
    )
  ) {
    return 'Các tham số thời gian phải là số nguyên dương (phút).';
  }
  if (config.maxSessionMinutes < config.slotMinutes) return 'Thời lượng sạc tối đa phải ≥ độ dài một khung giờ.';
  if (config.openHour >= config.closeHour) return 'Giờ mở cửa phải trước giờ đóng cửa.';
  return null;
}

export class SchedulingService implements IScheduling {
  constructor(
    private readonly persistence: IPersistence,
    private readonly clock: IClock,
  ) {}

  private state(): ChargingState {
    return pickChargingState(this.persistence.load());
  }

  private save(state: ChargingState | AppData): void {
    this.persistence.save(state);
  }

  now(): number {
    return this.clock.now();
  }

  /* --------------------------- Truy vấn dữ liệu -------------------------- */

  bookingState(): ChargingState {
    return this.state();
  }

  ports(): ChargePoint[] {
    return this.persistence.load().chargePoints;
  }

  queue(): ChargingRequest[] {
    return this.persistence.load().chargingRequests;
  }

  bookings(): ChargingBooking[] {
    return this.persistence.load().chargingBookings;
  }

  priorityQueue(hubId: string): RankedChargingRequest[] {
    return prioritizeVehicles(this.state(), hubId, this.now());
  }

  freePorts(hubId: string): FreeChargingPort[] {
    return getFreePortsNow(this.state(), hubId, this.now());
  }

  queueOverflow(hubId: string): ChargingOverflowInfo {
    return processQueueOverflow(this.state(), hubId, this.now());
  }

  portStates(hubId: string, start: number, end: number): PortWindowState[] {
    const state = this.state();
    const now = this.now();
    return state.chargePoints
      .filter((port) => port.hubId === hubId)
      .map((port) => ({ port, status: getPortStateInWindow(state, port, start, end, now) }));
  }

  /* ------------------------------ Đồng hồ -------------------------------- */

  advanceClock(minutes: number): string[] {
    this.clock.advance(minutes);
    const result = runChargingTick(this.state(), this.now());
    if (result.changed) this.save(result.state);
    return result.events;
  }

  resetClock(): void {
    this.clock.reset();
    this.save(syncChargingState(this.state(), this.now()));
  }

  tick(): string[] {
    const result = runChargingTick(this.state(), this.now());
    if (result.changed) this.save(result.state);
    return result.events;
  }

  /* --------------------------- Lịch sạc theo giờ ------------------------- */

  createReservation(input: ChargingReservationRequest): ApiResult<{ reservation?: ChargingBooking }> {
    const result = createChargingReservation(this.state(), input as ReservationInput, this.now());
    if (!result.ok) return result;
    this.save(result.state);
    return { ok: true, message: result.message, reservation: result.reservation };
  }

  cancelReservation(reservationId: string): OperationResult {
    const result = cancelChargingReservation(this.state(), reservationId, this.now());
    if (result.ok) this.save(result.state);
    return { ok: result.ok, message: result.message };
  }

  checkIn(code: string, studentId?: string): OperationResult {
    // Xử lý các phiên phải nhường cổng trước khi check-in.
    const ticked = runChargingTick(this.state(), this.now());
    const result = validateCheckIn(ticked.state, { code, studentId }, this.now());
    if (!result.ok) {
      if (ticked.changed) this.save(ticked.state);
      return result;
    }
    this.save(result.state);
    return { ok: true, message: result.message };
  }

  /** Sinh viên tự lấy chỗ sạc bằng mã tại cổng (được check-in sớm). */
  checkInStudent(code: string, studentId: string): OperationResult {
    const ticked = runChargingTick(this.state(), this.now());
    const result = validateCheckIn(ticked.state, { code, studentId }, this.now(), { allowEarly: true });
    if (!result.ok) {
      if (ticked.changed) this.save(ticked.state);
      return result;
    }
    this.save(result.state);
    return { ok: true, message: result.message };
  }

  /** Sinh viên trả chỗ sạc bằng mã — kết thúc phiên và giải phóng cổng. */
  checkOutStudent(code: string, studentId: string): OperationResult {
    const state = this.state();
    const booking = state.chargingBookings.find(
      (item) => item.code.trim().toUpperCase() === code.trim().toUpperCase(),
    );
    if (!booking) return { ok: false, message: 'Mã trả chỗ sạc không tồn tại.' };
    if (booking.studentId !== studentId) {
      return { ok: false, message: 'Mã này không thuộc tài khoản của bạn.' };
    }
    if (booking.status !== 'CHECKED_IN') {
      return { ok: false, message: 'Lịch này chưa được lấy chỗ hoặc đã kết thúc.' };
    }
    const session = state.chargingSessions.find(
      (item) =>
        item.reservationId === booking.id && (item.status === 'CHARGING' || item.status === 'FULL'),
    );
    if (!session) return { ok: false, message: 'Không tìm thấy phiên sạc đang chạy cho lịch này.' };

    const result = completeChargingSession(state, session.id, 'user_stop', this.now());
    if (!result.ok) return { ok: false, message: result.message };
    this.save(result.state);
    return { ok: true, message: result.message };
  }

  completeSession(sessionId: string, reason: ChargingEndReason = 'user_stop'): OperationResult {
    const result = completeChargingSession(this.state(), sessionId, reason, this.now());
    if (!result.ok) return result;
    this.save(result.state);
    const suffix = result.nextAllocated
      ? ` Hệ thống đã cấp điện cho ${result.nextAllocated} xe kế tiếp trong hàng đợi.`
      : '';
    return { ok: true, message: result.message + suffix };
  }

  /* ----------------------------- Hàng đợi ưu tiên ------------------------ */

  requestCharging(
    vehicleId: string,
    options?: { source?: 'student' | 'operator'; targetBattery?: number; neededBy?: string; note?: string },
  ): OperationResult {
    const result = requestCharging(
      this.state(),
      { vehicleId, source: options?.source ?? 'student', ...options },
      this.now(),
    );
    if (result.ok) this.save(result.state);
    return { ok: result.ok, message: result.message };
  }

  cancelRequest(requestId: string): OperationResult {
    const result = cancelChargingRequest(this.state(), requestId);
    if (result.ok) this.save(result.state);
    return { ok: result.ok, message: result.message };
  }

  createSmartSchedule(hubId: string): ApiResult<{ allocated?: number; overflow?: number }> {
    const result = createSmartChargingSchedule(this.state(), hubId, this.now());
    if (!result.ok) return result;
    this.save(result.state);
    return {
      ok: true,
      message: result.message,
      allocated: result.allocated.length,
      overflow: result.overflow.length,
    };
  }

  allocatePower(hubId: string): OperationResult & { allocated?: number; overflow?: number } {
    const result = allocateChargingPower(this.state(), hubId, this.now());
    this.save(result.state);
    if (result.allocated.length === 0) {
      return {
        ok: false,
        message: result.overflow.length
          ? 'Không còn cổng trống — các xe tiếp tục chờ trong hàng đợi.'
          : 'Không có xe nào đang chờ cấp điện.',
        allocated: 0,
        overflow: result.overflow.length,
      };
    }
    return {
      ok: true,
      message: `Đã cấp điện cho ${result.allocated.length} xe theo thứ tự ưu tiên.`,
      allocated: result.allocated.length,
      overflow: result.overflow.length,
    };
  }

  setPortMaintenance(portId: string, underMaintenance: boolean): OperationResult {
    const result = setPortMaintenance(this.state(), portId, underMaintenance, this.now());
    if (result.ok) this.save(result.state);
    return { ok: result.ok, message: result.message };
  }

  updateConfig(patch: Partial<ChargingConfig>): OperationResult {
    const current = this.state().chargingConfig;
    const next = { ...current, ...patch, updatedAt: new Date(this.now()).toISOString() };
    const error = validateConfig(next);
    if (error) return { ok: false, message: error };
    this.persistence.save({ chargingConfig: next });
    return { ok: true, message: 'Đã lưu tham số sạc.' };
  }
}
