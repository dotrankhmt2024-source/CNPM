import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData, Booking, ChargingReservation, HubStatus, ParkingReservation } from '../types/domain';
import { initialData } from '../mocks/seed';

type Result = { ok: boolean; message: string };
type ReserveResult = Result & { booking?: Booking };
type ReturnResult = Result & { durationMinutes?: number };

type Store = AppData & {
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
  requestCharging: (vehicleId: string) => Result;
  dispatchVehicles: (input: {
    fromHubId: string;
    toHubId: string;
    quantity: number;
  }) => Result & { moved?: number };
  updateHubStatus: (hubId: string, status: HubStatus) => void;
  updateChargingStatus: (id: string, status: 'queued' | 'charging' | 'completed') => void;
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

      reset: () => set(structuredClone(initialData)),

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

      requestCharging: (vehicleId) => {
        const state = get();
        const vehicle = state.vehicles.find((item) => item.id === vehicleId);
        if (!vehicle || vehicle.status !== 'available') {
          return { ok: false, message: 'Xe không khả dụng để đăng ký sạc' };
        }
        const hub = state.hubs.find((item) => item.id === vehicle.hubId);
        if (!hub) return { ok: false, message: 'Không tìm thấy Hub' };

        const canCharge = hub.activeCharging < hub.chargers;
        set({
          chargingRequests: [
            {
              id: uid(),
              vehicleId,
              hubId: vehicle.hubId,
              priority: 100 - vehicle.battery,
              status: canCharge ? 'charging' : 'queued',
            },
            ...state.chargingRequests,
          ],
          vehicles: state.vehicles.map((item) =>
            item.id === vehicleId
              ? { ...item, status: canCharge ? 'charging' : 'available' }
              : item,
          ),
          hubs: state.hubs.map((item) =>
            item.id === hub.id && canCharge
              ? { ...item, activeCharging: item.activeCharging + 1 }
              : item,
          ),
        });
        return {
          ok: true,
          message: canCharge ? 'Đã bắt đầu phiên sạc mô phỏng' : 'Đã thêm vào hàng đợi sạc',
        };
      },

      dispatchVehicles: ({ fromHubId, toHubId, quantity }) => {
        const state = get();
        const from = state.hubs.find((item) => item.id === fromHubId);
        const to = state.hubs.find((item) => item.id === toHubId);
        if (!from || !to) return { ok: false, message: 'Không tìm thấy Hub' };
        if (from.id === to.id) return { ok: false, message: 'Hub cần xe và Hub cung cấp xe phải khác nhau.' };
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return { ok: false, message: 'Số lượng xe phải là số nguyên dương.' };
        }

        const availableAtFrom = state.vehicles.filter(
          (vehicle) => vehicle.hubId === from.id && vehicle.status === 'available',
        );
        if (quantity > availableAtFrom.length) {
          return {
            ok: false,
            message: `Hub cung cấp xe không đủ xe (chỉ còn ${availableAtFrom.length} xe khả dụng).`,
          };
        }

        const freeAtTo = to.capacity - to.occupiedParking;
        if (quantity > freeAtTo) {
          return { ok: false, message: `Hub cần xe không đủ sức chứa (chỉ còn ${freeAtTo} chỗ).` };
        }

        const movingIds = new Set(availableAtFrom.slice(0, quantity).map((vehicle) => vehicle.id));
        set({
          vehicles: state.vehicles.map((vehicle) =>
            movingIds.has(vehicle.id) ? { ...vehicle, hubId: to.id } : vehicle,
          ),
          hubs: state.hubs.map((hub) =>
            hub.id === from.id
              ? { ...hub, occupiedParking: Math.max(0, hub.occupiedParking - quantity) }
              : hub.id === to.id
                ? { ...hub, occupiedParking: hub.occupiedParking + quantity }
                : hub,
          ),
        });
        return { ok: true, message: `Đã điều phối ${quantity} xe từ ${from.name} tới ${to.name}.`, moved: quantity };
      },

      updateHubStatus: (hubId, status) =>
        set((state) => ({
          hubs: state.hubs.map((hub) => (hub.id === hubId ? { ...hub, status } : hub)),
        })),

      updateChargingStatus: (id, status) =>
        set((state) => ({
          chargingRequests: state.chargingRequests.map((item) =>
            item.id === id ? { ...item, status } : item,
          ),
        })),

      resolveIncident: (id) =>
        set((state) => ({
          incidents: state.incidents.map((item) =>
            item.id === id ? { ...item, resolved: true } : item,
          ),
        })),
    }),
    { name: 'smart-emobility-demo-v4' },
  ),
);
