/**
 * useAppStore — read model + command facade phía Client.
 *
 * - **Đọc**: dữ liệu lấy từ server (`GET /api/state`) và giữ trong `appDataStore`;
 *   component vẫn dùng selector quen thuộc (`useAppStore((s) => s.hubs)`).
 * - **Ghi**: mọi thao tác gọi `POST /api/command`; server chạy nghiệp vụ, trả lại ảnh
 *   chụp dữ liệu mới, client thay thế read model bằng ảnh chụp đó.
 */
import { create } from 'zustand';
import { api } from '@/client/api/http';
import { authStore } from '@/client/api/useAuthStore';
import { simulatedNow } from '@/shared/clock';
import { appDataStore } from '@/subsystems/platform-integration/datastore/DataStore';
import type { ChargingReservationRequest, ChargingSlotRequest, DispatchRequest } from '@/contracts';
import type {
  AppData,
  Booking,
  ChargingBooking,
  ChargingConfig,
  ChargingEndReason,
  DispatchOrder,
  HubStatus,
  ParkingReservation,
  RedirectPlan,
} from '@/shared/types/domain';

type Result = { ok: boolean; message: string };
type ReserveResult = Result & { booking?: Booking };
type ReturnResult = Result & { durationMinutes?: number };

export interface AppCommands {
  /** Đã nạp xong dữ liệu từ server chưa. */
  ready: boolean;
  bootstrap: () => Promise<void>;
  /** Nạp lại dữ liệu vận hành (dùng cho đồng bộ định kỳ giữa các tab/người dùng). */
  refresh: () => Promise<void>;

  reset: () => Promise<Result>;
  reserveVehicle: (vehicleId: string, returnHubId?: string) => Promise<ReserveResult>;
  pickupVehicle: (bookingId: string, code: string) => Promise<Result>;
  returnVehicle: (bookingId: string, code: string) => Promise<ReturnResult>;
  cancelBooking: (bookingId: string) => Promise<Result>;
  bookParking: (input: {
    hubId: string;
    slotId: string;
    vehicleType: string;
    startTime: string;
    endTime: string;
  }) => Promise<Result & { reservation?: ParkingReservation }>;
  cancelParking: (reservationId: string) => Promise<Result>;
  checkInParking: (code: string) => Promise<Result>;
  checkOutParking: (code: string) => Promise<Result>;
  /** Đặt lịch sạc trên cổng của Hub (dùng chung dữ liệu với nhà điều hành). */
  bookChargingSlot: (input: ChargingSlotRequest) => Promise<Result & { booking?: ChargingBooking }>;
  cancelChargingSlot: (bookingId: string) => Promise<Result>;
  checkInChargingSlot: (code: string) => Promise<Result>;
  checkOutChargingSlot: (code: string) => Promise<Result>;

  updateHubStatus: (hubId: string, status: HubStatus) => Promise<void>;
  resolveIncident: (id: string) => Promise<void>;

  /** Đồng hồ mô phỏng. */
  now: () => number;
  advanceClock: (minutes: number) => Promise<string[]>;
  resetClock: () => Promise<void>;
  tickCharging: () => Promise<string[]>;

  /* Lập lịch sạc ưu tiên & phiên sạc */
  createChargingReservation: (input: ChargingReservationRequest) => Promise<Result & { reservation?: ChargingBooking }>;
  cancelChargingReservation: (reservationId: string) => Promise<Result>;
  checkInCharging: (code: string, studentId?: string) => Promise<Result>;
  completeChargingSession: (sessionId: string, reason?: ChargingEndReason) => Promise<Result>;
  requestCharging: (
    vehicleId: string,
    options?: { source?: 'student' | 'operator'; targetBattery?: number; neededBy?: string; note?: string },
  ) => Promise<Result>;
  cancelChargingRequest: (requestId: string) => Promise<Result>;
  createSmartChargingSchedule: (hubId: string) => Promise<Result & { allocated?: number; overflow?: number }>;
  allocateChargingPower: (hubId: string) => Promise<Result & { allocated?: number; overflow?: number }>;
  setPortMaintenance: (portId: string, underMaintenance: boolean) => Promise<Result>;
  updateChargingConfig: (patch: Partial<ChargingConfig>) => Promise<Result>;

  /* Điều phối xe */
  createDispatchOrder: (input: DispatchRequest) => Promise<Result & { order?: DispatchOrder; warning?: string | null }>;
  assignDispatchStaff: (orderId: string, staffId: string) => Promise<Result>;
  startDispatchTransport: (orderId: string) => Promise<Result>;
  completeDispatchOrder: (orderId: string) => Promise<Result>;
  cancelDispatchOrder: (orderId: string, reason: string) => Promise<Result>;

  /* Điều hướng người dùng */
  approveRedirectionPlan: (input: {
    overloadedHubId: string;
    targetHubId: string;
    note?: string;
  }) => Promise<Result & { plan?: RedirectPlan; offerCount?: number }>;
  closeRedirectionPlan: (planId: string) => Promise<Result>;
  acceptRedirectionOffer: (offerId: string) => Promise<Result & { moved?: boolean }>;
  rejectRedirectionOffer: (offerId: string) => Promise<Result & { warning?: string }>;
  respondToGeneralNotice: (planId: string, accept: boolean) => Promise<Result & { warning?: string }>;
}

export type AppStoreState = AppData & AppCommands;

/** Gửi lệnh lên server và cập nhật read model bằng ảnh chụp mới. */
const call = async (name: string, args: Record<string, unknown> = {}): Promise<Result & Record<string, unknown>> => {
  const result = await api.command(name, args);
  if (result.state) appDataStore.setState(result.state, true);
  return result;
};

const commands: AppCommands = {
  ready: false,
  bootstrap: async () => {
    const user = await authStore.getState().restoreSession();
    if (user) {
      const state = await api.state();
      if (state) appDataStore.setState(state, true);
    }
    useClientStore.setState({ ready: true });
  },

  refresh: async () => {
    if (!authStore.getState().currentUser) return;
    const state = await api.state();
    if (state) appDataStore.setState(state, true);
  },

  reset: async () => {
    const result = await api.reset();
    if (result.state) appDataStore.setState(result.state, true);
    return result;
  },

  reserveVehicle: async (vehicleId, returnHubId) =>
    (await call('student.reserveVehicle', { vehicleId, returnHubId })) as unknown as ReserveResult,
  pickupVehicle: async (bookingId, code) => call('student.pickupVehicle', { bookingId, code }),
  returnVehicle: async (bookingId, code) =>
    (await call('student.returnVehicle', { bookingId, code })) as unknown as ReturnResult,
  cancelBooking: async (bookingId) => call('student.cancelBooking', { bookingId }),
  bookParking: async (input) =>
    (await call('student.bookParking', { ...input })) as unknown as Result & { reservation?: ParkingReservation },
  cancelParking: async (reservationId) => call('student.cancelParking', { reservationId }),
  checkInParking: async (code) => call('student.checkInParking', { code }),
  checkOutParking: async (code) => call('student.checkOutParking', { code }),
  bookChargingSlot: async (input) =>
    (await call('student.bookChargingSlot', { ...input } as unknown as Record<string, unknown>)) as unknown as Result & {
      booking?: ChargingBooking;
    },
  cancelChargingSlot: async (bookingId) => call('student.cancelChargingSlot', { bookingId }),
  checkInChargingSlot: async (code) => call('student.checkInChargingSlot', { code }),
  checkOutChargingSlot: async (code) => call('student.checkOutChargingSlot', { code }),

  updateHubStatus: async (hubId, status) => {
    await call('operator.updateHubStatus', { hubId, status });
  },
  resolveIncident: async (incidentId) => {
    await call('operator.resolveIncident', { incidentId });
  },

  now: () => simulatedNow(appDataStore.getState().clockOffsetMinutes ?? 0, Date.now()),
  advanceClock: async (minutes) => {
    const result = await call('system.advanceClock', { minutes });
    return (result.events as string[] | undefined) ?? [];
  },
  resetClock: async () => {
    await call('system.resetClock');
  },
  tickCharging: async () => {
    const result = await call('system.tickCharging');
    return (result.events as string[] | undefined) ?? [];
  },

  createChargingReservation: async (input) =>
    (await call('operator.createChargingReservation', { ...input } as unknown as Record<string, unknown>)) as unknown as Result & {
      reservation?: ChargingBooking;
    },
  cancelChargingReservation: async (reservationId) =>
    call('operator.cancelChargingReservation', { reservationId }),
  checkInCharging: async (code, studentId) => call('operator.checkInCharging', { code, studentId }),
  completeChargingSession: async (sessionId, reason) =>
    call('operator.completeChargingSession', { sessionId, reason }),
  requestCharging: async (vehicleId, options) => call('operator.requestCharging', { vehicleId, options }),
  cancelChargingRequest: async (requestId) => call('operator.cancelChargingRequest', { requestId }),
  createSmartChargingSchedule: async (hubId) =>
    (await call('operator.createSmartChargingSchedule', { hubId })) as unknown as Result & {
      allocated?: number;
      overflow?: number;
    },
  allocateChargingPower: async (hubId) =>
    (await call('operator.allocateChargingPower', { hubId })) as unknown as Result & {
      allocated?: number;
      overflow?: number;
    },
  setPortMaintenance: async (portId, underMaintenance) =>
    call('operator.setPortMaintenance', { portId, underMaintenance }),
  updateChargingConfig: async (patch) => call('operator.updateChargingConfig', { patch }),

  createDispatchOrder: async (input) =>
    (await call('operator.createDispatchOrder', { ...input } as unknown as Record<string, unknown>)) as unknown as Result & {
      order?: DispatchOrder;
      warning?: string | null;
    },
  assignDispatchStaff: async (orderId, staffId) => call('operator.assignDispatchStaff', { orderId, staffId }),
  startDispatchTransport: async (orderId) => call('operator.startDispatchTransport', { orderId }),
  completeDispatchOrder: async (orderId) => call('operator.completeDispatchOrder', { orderId }),
  cancelDispatchOrder: async (orderId, reason) => call('operator.cancelDispatchOrder', { orderId, reason }),

  approveRedirectionPlan: async (input) =>
    (await call('operator.approveRedirectionPlan', { ...input })) as unknown as Result & {
      plan?: RedirectPlan;
      offerCount?: number;
    },
  closeRedirectionPlan: async (planId) => call('operator.closeRedirectionPlan', { planId }),
  acceptRedirectionOffer: async (offerId) => call('student.respondToOffer', { offerId, accept: true }),
  rejectRedirectionOffer: async (offerId) => call('student.respondToOffer', { offerId, accept: false }),
  respondToGeneralNotice: async (planId, accept) => call('student.respondToGeneralNotice', { planId, accept }),
};

const useClientStore = create<AppStoreState>()(() => ({
  ...appDataStore.getState(),
  ...commands,
}));

/** Read model đổi (nạp từ server hoặc sau mỗi lệnh) → cập nhật store cho component. */
appDataStore.subscribe((state) => useClientStore.setState(state));

const selectAll = (state: AppStoreState) => state;

/** Truy cập store ngoài React (kiểm thử tích hợp, công cụ debug). */
export { useClientStore as appClientStore };

export function useAppStore(): AppStoreState;
export function useAppStore<T>(selector: (state: AppStoreState) => T): T;
export function useAppStore<T>(selector?: (state: AppStoreState) => T): AppStoreState | T {
  const select = (selector ?? selectAll) as (state: AppStoreState) => AppStoreState | T;
  return useClientStore(select);
}
