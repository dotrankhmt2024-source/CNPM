/**
 * Các action của phân hệ sạc trong store chung. Toàn bộ quy tắc nghiệp vụ nằm ở
 * services/chargingScheduler.ts; slice này chỉ lấy thời gian mô phỏng, gọi service
 * và ghi state mới vào store.
 */
import type { AppData, ChargingConfig, ChargingEndReason, ChargingReservation, PersonalVehicle } from '../../types/domain';
import {
  allocateChargingPower,
  cancelChargingRequest,
  cancelChargingReservation,
  completeChargingSession,
  createChargingReservation,
  createSmartChargingSchedule,
  makeId,
  pickChargingState,
  requestCharging,
  runChargingTick,
  setPortMaintenance,
  syncChargingState,
  validateCheckIn,
  type ReservationInput,
} from '../../services/chargingScheduler';
import { simulatedNow, toDateKey } from '../../services/clock';
import { useAuthStore } from '../useAuthStore';

type Result = { ok: boolean; message: string };
type Setter = (partial: Partial<AppData>) => void;
type Getter = () => AppData;

export interface ChargingActions {
  /** Thời điểm hiện tại theo đồng hồ mô phỏng (ms). */
  now: () => number;
  advanceClock: (minutes: number) => string[];
  resetClock: () => void;
  /** Xử lý định kỳ: lịch quá hạn, phiên phải nhường cổng, đồng bộ trạng thái cổng. */
  tickCharging: () => string[];

  createChargingReservation: (input: ReservationInput) => Result & { reservation?: ChargingReservation };
  /**
   * Giao diện đặt lịch của trang Sinh viên (bản do-dev): đặt cổng `portCode` tại `hubId`
   * lúc `startTime` hôm nay. Lịch được lưu chung với lịch sạc theo khung giờ nên
   * hiển thị trên màn hình Lập lịch sạc ưu tiên của nhà điều hành.
   */
  bookCharging: (input: {
    hubId: string;
    portCode: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    power: number;
  }) => Result & { reservation?: ChargingReservation };
  cancelChargingReservation: (reservationId: string) => Result;
  checkInCharging: (code: string, studentId?: string) => Result;
  completeChargingSession: (sessionId: string, reason?: ChargingEndReason) => Result;

  requestCharging: (
    vehicleId: string,
    options?: { source?: 'student' | 'operator'; targetBattery?: number; neededBy?: string; note?: string },
  ) => Result;
  cancelChargingRequest: (requestId: string) => Result;
  createSmartChargingSchedule: (hubId: string) => Result & { allocated?: number; overflow?: number };
  allocateChargingPower: (hubId: string) => Result & { allocated?: number; overflow?: number };
  setPortMaintenance: (portId: string, underMaintenance: boolean) => Result;
  updateChargingConfig: (patch: Partial<ChargingConfig>) => Result;

  addPersonalVehicle: (vehicle: Omit<PersonalVehicle, 'id'>) => Result & { vehicle?: PersonalVehicle };
}

/** Kiểm tra tham số cấu hình sạc (ChargingParameterConfig.updateConfig). */
function validateConfig(config: ChargingConfig): string | null {
  const percent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
  if (!percent(config.lowBatteryThreshold) || !percent(config.criticalBatteryThreshold) || !percent(config.defaultTargetBattery)) {
    return 'Các ngưỡng pin phải nằm trong khoảng 0–100%.';
  }
  if (config.criticalBatteryThreshold > config.lowBatteryThreshold) {
    return 'Ngưỡng pin nguy cấp phải nhỏ hơn hoặc bằng ngưỡng pin thấp.';
  }
  if (config.defaultTargetBattery <= config.lowBatteryThreshold) {
    return 'Mức pin mục tiêu phải lớn hơn ngưỡng pin thấp.';
  }
  const positiveInt = (value: number) => Number.isInteger(value) && value > 0;
  if (![config.timeWindowMinutes, config.slotMinutes, config.maxSessionMinutes, config.holdMinutes].every(positiveInt)) {
    return 'Các tham số thời gian phải là số nguyên dương (phút).';
  }
  if (config.maxSessionMinutes < config.slotMinutes) return 'Thời lượng sạc tối đa phải ≥ độ dài một khung giờ.';
  if (config.openHour >= config.closeHour) return 'Giờ mở cửa phải trước giờ đóng cửa.';
  return null;
}

export const createChargingActions = (set: Setter, get: Getter): ChargingActions => {
  const now = () => simulatedNow(get().clockOffsetMinutes ?? 0);
  const state = () => pickChargingState(get());

  return {
    now,

    advanceClock: (minutes) => {
      set({ clockOffsetMinutes: (get().clockOffsetMinutes ?? 0) + minutes });
      const result = runChargingTick(state(), now());
      if (result.changed) set(result.state);
      return result.events;
    },

    resetClock: () => {
      set({ clockOffsetMinutes: 0 });
      set(syncChargingState(state(), now()));
    },

    tickCharging: () => {
      const result = runChargingTick(state(), now());
      if (result.changed) set(result.state);
      return result.events;
    },

    createChargingReservation: (input) => {
      const result = createChargingReservation(state(), input, now());
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, reservation: result.reservation };
    },

    bookCharging: ({ hubId, portCode, startTime, durationMinutes, power }) => {
      const port = get().chargingPorts.find((item) => item.hubId === hubId && item.code === portCode);
      if (!port) return { ok: false, message: 'Không tìm thấy cổng sạc.' };
      const user = useAuthStore.getState().currentUser;
      const result = createChargingReservation(
        state(),
        {
          studentId: user?.id ?? 'student',
          studentName: user?.fullName ?? 'Sinh viên',
          hubId,
          portId: port.id,
          vehicleKind: 'personal',
          vehicleId: `xe-${user?.id ?? 'sv'}`,
          vehicleLabel: `Xe của ${user?.fullName ?? 'sinh viên'}`,
          vehicleType: 'car',
          batteryCapacityKwh: 60,
          currentBattery: 20,
          targetBattery: 80,
          dateKey: toDateKey(now()),
          startTime,
          durationMinutes,
          price: power >= 120 ? 90000 : 50000,
        },
        now(),
      );
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: 'Đặt chỗ sạc thành công', reservation: result.reservation };
    },

    cancelChargingReservation: (reservationId) => {
      const result = cancelChargingReservation(state(), reservationId, now());
      if (result.ok) set(result.state);
      return { ok: result.ok, message: result.message };
    },

    checkInCharging: (code, studentId) => {
      // Xử lý các phiên phải nhường cổng trước khi check-in.
      const ticked = runChargingTick(state(), now());
      const result = validateCheckIn(ticked.state, { code, studentId }, now());
      if (!result.ok) {
        if (ticked.changed) set(ticked.state);
        return result;
      }
      set(result.state);
      return { ok: true, message: result.message };
    },

    completeChargingSession: (sessionId, reason = 'user_stop') => {
      const result = completeChargingSession(state(), sessionId, reason, now());
      if (!result.ok) return result;
      set(result.state);
      const suffix = result.nextAllocated ? ` Hệ thống đã cấp điện cho ${result.nextAllocated} xe kế tiếp trong hàng đợi.` : '';
      return { ok: true, message: result.message + suffix };
    },

    requestCharging: (vehicleId, options) => {
      const result = requestCharging(
        state(),
        { vehicleId, source: options?.source ?? 'student', ...options },
        now(),
      );
      if (result.ok) set(result.state);
      return { ok: result.ok, message: result.message };
    },

    cancelChargingRequest: (requestId) => {
      const result = cancelChargingRequest(state(), requestId);
      if (result.ok) set(result.state);
      return { ok: result.ok, message: result.message };
    },

    createSmartChargingSchedule: (hubId) => {
      const result = createSmartChargingSchedule(state(), hubId, now());
      if (!result.ok) return result;
      set(result.state);
      return { ok: true, message: result.message, allocated: result.allocated.length, overflow: result.overflow.length };
    },

    allocateChargingPower: (hubId) => {
      const result = allocateChargingPower(state(), hubId, now());
      set(result.state);
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
    },

    setPortMaintenance: (portId, underMaintenance) => {
      const result = setPortMaintenance(state(), portId, underMaintenance, now());
      if (result.ok) set(result.state);
      return { ok: result.ok, message: result.message };
    },

    updateChargingConfig: (patch) => {
      const next = { ...get().chargingConfig, ...patch, updatedAt: new Date(now()).toISOString() };
      const error = validateConfig(next);
      if (error) return { ok: false, message: error };
      set({ chargingConfig: next });
      return { ok: true, message: 'Đã lưu tham số sạc.' };
    },

    addPersonalVehicle: (input) => {
      const plate = input.licensePlate.trim().toUpperCase();
      if (!plate || !input.model.trim()) return { ok: false, message: 'Vui lòng nhập biển số và tên xe.' };
      if (get().personalVehicles.some((item) => item.licensePlate.toUpperCase() === plate)) {
        return { ok: false, message: 'Biển số này đã được đăng ký.' };
      }
      if (!(input.batteryCapacityKwh > 0 && input.batteryCapacityKwh <= 200)) {
        return { ok: false, message: 'Dung lượng pin không hợp lệ.' };
      }
      const vehicle: PersonalVehicle = { ...input, licensePlate: plate, model: input.model.trim(), id: makeId('pv') };
      set({ personalVehicles: [...get().personalVehicles, vehicle] });
      return { ok: true, message: 'Đã thêm xe cá nhân.', vehicle };
    },
  };
};
