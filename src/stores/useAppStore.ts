import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData, Booking, ChargingReservation, HubStatus, ParkingReservation } from '../types/domain';
import { createInitialData, initialData } from '../mocks/seed';
import { createChargingActions, type ChargingActions } from './slices/chargingSlice';
import { createDispatchActions, type DispatchActions } from './slices/dispatchSlice';

type Result = { ok: boolean; message: string };
type ReserveResult = Result & { booking?: Booking };
type ReturnResult = Result & { durationMinutes?: number };

type Store = AppData &
  ChargingActions &
  DispatchActions & {
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
  bookCharging: (input: {
    hubId: string;
    portCode: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    power: number;
  }) => Result & { reservation?: ChargingReservation };
  updateHubStatus: (hubId: string, status: HubStatus) => void;
  resolveIncident: (id: string) => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** Thời gian giữ chỗ sau khi đặt xe (phút) — khớp mô tả "mã hết hạn trong 5 phút". */
export const PICKUP_HOLD_MINUTES = 5;

const makePickupCode = () => `SEMH${Math.floor(100000 + Math.random() * 900000)}`;

const minutesBetween = (from: string, to: string) =>
  Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));

export const useAppStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialData,

      reset: () => set(createInitialData()),

      reserveVehicle: (vehicleId, returnHubId) => {
        const state = get();
        const vehicle = state.vehicles.find((item) => item.id === vehicleId);
        if (!vehicle || vehicle.status !== 'available') {
          return { ok: false, message: 'Xe không còn khả dụng' };
        }
        const hub = state.hubs.find((item) => item.id === vehicle.hubId);
        if (!hub) return { ok: false, message: 'Không tìm thấy Hub nhận xe' };

        const returnHub = state.hubs.find((item) => item.id === returnHubId) ?? hub;
        const now = new Date();
        const booking: Booking = {
          id: uid(),
          vehicleId,
          hubId: vehicle.hubId,
          returnHubId: returnHub.id,
          studentName: 'Sinh viên demo',
          status: 'reserved',
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + PICKUP_HOLD_MINUTES * 60_000).toISOString(),
          pickupCode: makePickupCode(),
        };

        set({
          vehicles: state.vehicles.map((item) =>
            item.id === vehicleId ? { ...item, status: 'reserved' } : item,
          ),
          bookings: [booking, ...state.bookings],
        });
        return { ok: true, message: 'Đặt xe thành công', booking };
      },

      pickupVehicle: (bookingId, code) => {
        const state = get();
        const booking = state.bookings.find((item) => item.id === bookingId);
        if (!booking || booking.status !== 'reserved') {
          return { ok: false, message: 'Không tìm thấy lượt đặt đang chờ nhận xe' };
        }
        if (booking.expiresAt && new Date(booking.expiresAt).getTime() < Date.now()) {
          return { ok: false, message: 'Mã nhận xe đã hết hạn. Vui lòng đặt lại xe.' };
        }
        if (booking.pickupCode !== code.trim()) {
          return { ok: false, message: 'Mã nhận xe không đúng. Vui lòng kiểm tra lại.' };
        }

        const now = new Date().toISOString();
        set({
          bookings: state.bookings.map((item) =>
            item.id === bookingId ? { ...item, status: 'picked_up', startedAt: now } : item,
          ),
          vehicles: state.vehicles.map((item) =>
            item.id === booking.vehicleId ? { ...item, status: 'in_use' } : item,
          ),
          hubs: state.hubs.map((hub) =>
            hub.id === booking.hubId
              ? { ...hub, occupiedParking: Math.max(0, hub.occupiedParking - 1) }
              : hub,
          ),
        });
        return { ok: true, message: 'Nhận xe thành công' };
      },

      returnVehicle: (bookingId, code) => {
        const state = get();
        const booking = state.bookings.find((item) => item.id === bookingId);
        if (!booking || booking.status !== 'picked_up') {
          return { ok: false, message: 'Chưa có lượt nhận xe nào để trả' };
        }
        if (booking.pickupCode !== code.trim()) {
          return { ok: false, message: 'Mã trả xe không đúng (mã trả xe trùng mã nhận xe).' };
        }
        const hub = state.hubs.find((item) => item.id === booking.returnHubId);
        if (!hub) return { ok: false, message: 'Không tìm thấy Hub trả xe' };
        if (hub.occupiedParking >= hub.capacity) {
          return { ok: false, message: 'Hub trả xe đã hết chỗ đỗ' };
        }

        const now = new Date().toISOString();
        const durationMinutes = minutesBetween(booking.startedAt ?? booking.createdAt, now);

        set({
          bookings: state.bookings.map((item) =>
            item.id === bookingId
              ? { ...item, status: 'completed', completedAt: now }
              : item,
          ),
          vehicles: state.vehicles.map((item) =>
            item.id === booking.vehicleId
              ? { ...item, hubId: hub.id, status: 'available' }
              : item,
          ),
          hubs: state.hubs.map((item) =>
            item.id === hub.id ? { ...item, occupiedParking: item.occupiedParking + 1 } : item,
          ),
        });
        return { ok: true, message: 'Trả xe thành công', durationMinutes };
      },

      cancelBooking: (bookingId) => {
        const state = get();
        const booking = state.bookings.find((item) => item.id === bookingId);
        if (!booking || booking.status !== 'reserved') {
          return { ok: false, message: 'Chỉ hủy được lượt đặt chưa nhận xe' };
        }
        set({
          bookings: state.bookings.map((item) =>
            item.id === bookingId ? { ...item, status: 'cancelled' } : item,
          ),
          vehicles: state.vehicles.map((item) =>
            item.id === booking.vehicleId ? { ...item, status: 'available' } : item,
          ),
        });
        return { ok: true, message: 'Đã hủy lượt đặt xe' };
      },

      bookParking: ({ hubId, slotId, vehicleType, startTime, endTime }) => {
        const state = get();
        const slot = state.parkingSlots.find((item) => item.id === slotId);
        if (!slot || slot.status !== 'free') {
          return { ok: false, message: 'Vị trí đỗ này không còn trống.' };
        }
        const alreadyBooked = state.parkingReservations.some(
          (item) => item.status === 'reserved' && item.slotId === slotId,
        );
        if (alreadyBooked) {
          return { ok: false, message: 'Vị trí đỗ vừa được người khác đặt.' };
        }

        const reservation: ParkingReservation = {
          id: uid(),
          hubId,
          slotId,
          slotLabel: slot.label,
          vehicleType,
          startAt: startTime,
          endAt: endTime,
          price: 5000,
          code: `DO${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'reserved',
        };

        set({
          parkingSlots: state.parkingSlots.map((item) =>
            item.id === slotId ? { ...item, status: 'reserved' } : item,
          ),
          parkingReservations: [reservation, ...state.parkingReservations],
        });
        return { ok: true, message: 'Đặt chỗ đỗ thành công', reservation };
      },

      bookCharging: ({ hubId, portCode, date, startTime, durationMinutes, power }) => {
        const state = get();
        const port = state.chargingPorts.find(
          (item) => item.hubId === hubId && item.code === portCode,
        );
        if (!port || port.status !== 'free') {
          return { ok: false, message: 'Cổng sạc này không còn trống.' };
        }

        const reservation: ChargingReservation = {
          id: uid(),
          hubId,
          portCode,
          date,
          startTime,
          durationMinutes,
          power,
          price: power >= 120 ? 90000 : 50000,
          code: `SAC${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'reserved',
        };

        set({
          chargingPorts: state.chargingPorts.map((item) =>
            item.id === port.id ? { ...item, status: 'reserved' } : item,
          ),
          chargingReservations: [reservation, ...state.chargingReservations],
        });
        return { ok: true, message: 'Đặt chỗ sạc thành công', reservation };
      },

      // Lập lịch sạc ưu tiên, phiên sạc (nhà điều hành) và điều phối xe:
      // xem stores/slices/chargingSlice.ts, stores/slices/dispatchSlice.ts
      ...createChargingActions(set, get),
      ...createDispatchActions(set, get),

      updateHubStatus: (hubId, status) =>
        set((state) => ({
          hubs: state.hubs.map((hub) => (hub.id === hubId ? { ...hub, status } : hub)),
        })),

      resolveIncident: (id) =>
        set((state) => ({
          incidents: state.incidents.map((item) =>
            item.id === id ? { ...item, resolved: true } : item,
          ),
        })),
    }),
    { name: 'smart-emobility-demo-v6' },
  ),
);
