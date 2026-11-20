/**
 * useAppStore — store phía Client (read model + command facade).
 *
 * - Dữ liệu đọc: đồng bộ từ DataStore của Platform, nên component vẫn dùng selector
 *   quen thuộc (`useAppStore((s) => s.hubs)`).
 * - Mọi thao tác ghi đều đi qua APIGateway (StudentAPI / OperatorAPI / SystemAPI);
 *   Client không gọi service nghiệp vụ trực tiếp.
 */
import { create } from 'zustand';
import { apiGateway } from '@/gateway';
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
  reset: () => void;
  reserveVehicle: (vehicleId: string, returnHubId?: string) => ReserveResult;
  pickupVehicle: (bookingId: string, code: string) => Result;
  returnVehicle: (bookingId: string, code: string) => ReturnResult;
  cancelBooking: (bookingId: string) => Result;
  bookParking: (input: {
    hubId: string;
    slotId: string;
    vehicleType: string;
    startTime: string;
    endTime: string;
  }) => Result & { reservation?: ParkingReservation };
  cancelParking: (reservationId: string) => Result;
  /** Đặt lịch sạc trên cổng của Hub (dùng chung dữ liệu với nhà điều hành). */
  bookChargingSlot: (input: ChargingSlotRequest) => Result & { booking?: ChargingBooking };
  cancelChargingSlot: (bookingId: string) => Result;
  updateHubStatus: (hubId: string, status: HubStatus) => void;
  resolveIncident: (id: string) => void;

  /** Đồng hồ mô phỏng. */
  now: () => number;
  advanceClock: (minutes: number) => string[];
  resetClock: () => void;
  tickCharging: () => string[];

  /* Lập lịch sạc ưu tiên & phiên sạc */
  createChargingReservation: (input: ChargingReservationRequest) => Result & { reservation?: ChargingBooking };
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

  /* Điều phối xe */
  createDispatchOrder: (input: DispatchRequest) => Result & { order?: DispatchOrder; warning?: string | null };
  assignDispatchStaff: (orderId: string, staffId: string) => Result;
  startDispatchTransport: (orderId: string) => Result;
  completeDispatchOrder: (orderId: string) => Result;
  cancelDispatchOrder: (orderId: string, reason: string) => Result;

  /* Điều hướng người dùng */
  approveRedirectionPlan: (input: {
    overloadedHubId: string;
    targetHubId: string;
    note?: string;
  }) => Result & { plan?: RedirectPlan; offerCount?: number };
  closeRedirectionPlan: (planId: string) => Result;
  acceptRedirectionOffer: (offerId: string) => Result & { moved?: boolean };
  rejectRedirectionOffer: (offerId: string) => Result & { warning?: string };
}

export type AppStoreState = AppData & AppCommands;

const commands: AppCommands = {
  reset: () => apiGateway.system.resetDemoData(),

  reserveVehicle: (vehicleId, returnHubId) =>
    apiGateway.student.reserveVehicle({ vehicleId, returnHubId }),
  pickupVehicle: (bookingId, code) => apiGateway.student.pickupVehicle(bookingId, code),
  returnVehicle: (bookingId, code) => apiGateway.student.returnVehicle(bookingId, code),
  cancelBooking: (bookingId) => apiGateway.student.cancelBooking(bookingId),
  bookParking: (input) => apiGateway.student.bookParking(input),
  cancelParking: (reservationId) => apiGateway.student.cancelParking(reservationId),
  bookChargingSlot: (input) => apiGateway.student.bookChargingSlot(input),
  cancelChargingSlot: (bookingId) => apiGateway.student.cancelChargingSlot(bookingId),

  updateHubStatus: (hubId, status) => {
    apiGateway.operator.updateHubStatus(hubId, status);
  },
  resolveIncident: (id) => {
    apiGateway.operator.resolveIncident(id);
  },

  now: () => apiGateway.system.now(),
  advanceClock: (minutes) => apiGateway.system.advanceClock(minutes),
  resetClock: () => apiGateway.system.resetClock(),
  tickCharging: () => apiGateway.system.tickCharging(),

  createChargingReservation: (input) => apiGateway.operator.createChargingReservation(input),
  cancelChargingReservation: (reservationId) => apiGateway.operator.cancelChargingReservation(reservationId),
  checkInCharging: (code, studentId) => apiGateway.operator.checkInCharging(code, studentId),
  completeChargingSession: (sessionId, reason) =>
    apiGateway.operator.completeChargingSession(sessionId, reason),
  requestCharging: (vehicleId, options) => apiGateway.operator.requestCharging(vehicleId, options),
  cancelChargingRequest: (requestId) => apiGateway.operator.cancelChargingRequest(requestId),
  createSmartChargingSchedule: (hubId) => apiGateway.operator.createSmartChargingSchedule(hubId),
  allocateChargingPower: (hubId) => apiGateway.operator.allocateChargingPower(hubId),
  setPortMaintenance: (portId, underMaintenance) =>
    apiGateway.operator.setPortMaintenance(portId, underMaintenance),
  updateChargingConfig: (patch) => apiGateway.operator.updateChargingConfig(patch),

  createDispatchOrder: (input) => apiGateway.operator.createDispatchOrder(input),
  assignDispatchStaff: (orderId, staffId) => apiGateway.operator.assignDispatchStaff(orderId, staffId),
  startDispatchTransport: (orderId) => apiGateway.operator.startDispatchTransport(orderId),
  completeDispatchOrder: (orderId) => apiGateway.operator.completeDispatchOrder(orderId),
  cancelDispatchOrder: (orderId, reason) => apiGateway.operator.cancelDispatchOrder(orderId, reason),

  approveRedirectionPlan: (input) => apiGateway.operator.approveRedirectionPlan(input),
  closeRedirectionPlan: (planId) => apiGateway.operator.closeRedirectionPlan(planId),
  acceptRedirectionOffer: (offerId) => apiGateway.student.respondToOffer(offerId, true),
  rejectRedirectionOffer: (offerId) => apiGateway.student.respondToOffer(offerId, false),
};

/** Bản sao đồng bộ của dữ liệu vận hành (SystemAPI.snapshot) kèm bộ lệnh gọi qua gateway. */
const useClientStore = create<AppStoreState>()(() => ({
  ...apiGateway.system.snapshot(),
  ...commands,
}));

apiGateway.system.subscribeData((state) => useClientStore.setState(state));
useClientStore.setState(apiGateway.system.snapshot());

const selectAll = (state: AppStoreState) => state;

/** Truy cập store ngoài React (kiểm thử tích hợp, công cụ debug). */
export { useClientStore as appClientStore };

export function useAppStore(): AppStoreState;
export function useAppStore<T>(selector: (state: AppStoreState) => T): T;
export function useAppStore<T>(selector?: (state: AppStoreState) => T): AppStoreState | T {
  const select = (selector ?? selectAll) as (state: AppStoreState) => AppStoreState | T;
  return useClientStore(select);
}
