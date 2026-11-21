/**
 * BookingService — component của subsystem Mobility.
 *
 * Cài đặt IBooking: đặt xe, nhận xe bằng mã, trả xe, huỷ lượt đặt.
 * Toàn bộ quy tắc nghiệp vụ nằm ở đây; Client chỉ nhìn thấy kết quả qua APIGateway.
 */
import type { IBooking, VehicleBookingInput } from '@/contracts/Mobility';
import type { ApiResult, IAuth, INotification, IPersistence, OperationResult } from '@/contracts';
import type { Booking } from '@/shared/types/domain';
import { occupyFreeSlots, releaseUsedSlots } from '@/shared/domain/parkingMath';

/** Thời gian giữ chỗ sau khi đặt xe (phút) — khớp mô tả "mã hết hạn trong 5 phút". */
export const PICKUP_HOLD_MINUTES = 5;

const uid = () => Math.random().toString(36).slice(2, 10);

const makePickupCode = () => `SEMH${Math.floor(100000 + Math.random() * 900000)}`;

const minutesBetween = (from: string, to: string) =>
  Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));

export class BookingService implements IBooking {
  constructor(
    private readonly persistence: IPersistence,
    private readonly notification: INotification,
    private readonly auth: IAuth,
  ) {}

  list(): Booking[] {
    return this.persistence.load().bookings;
  }

  listByStudent(studentId: string): Booking[] {
    return this.persistence.load().bookings.filter((booking) => booking.studentId === studentId);
  }

  reserveVehicle({ vehicleId, returnHubId }: VehicleBookingInput): ApiResult<{ booking?: Booking }> {
    this.expireOverdue(Date.now());
    const state = this.persistence.load();
    const vehicle = state.vehicles.find((item) => item.id === vehicleId);
    if (!vehicle || vehicle.status !== 'available') {
      return { ok: false, message: 'Xe không còn khả dụng' };
    }
    const hub = state.hubs.find((item) => item.id === vehicle.hubId);
    if (!hub) return { ok: false, message: 'Không tìm thấy Hub nhận xe' };

    const returnHub = state.hubs.find((item) => item.id === returnHubId) ?? hub;
    const now = new Date();
    const user = this.auth.currentUser();
    const booking: Booking = {
      id: uid(),
      vehicleId,
      hubId: vehicle.hubId,
      returnHubId: returnHub.id,
      studentId: user?.id ?? 'guest',
      studentName: user?.fullName ?? 'Khách',
      status: 'reserved',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PICKUP_HOLD_MINUTES * 60_000).toISOString(),
      pickupCode: makePickupCode(),
    };

    this.persistence.save({
      vehicles: state.vehicles.map((item) =>
        item.id === vehicleId ? { ...item, status: 'reserved' } : item,
      ),
      bookings: [booking, ...state.bookings],
    });
    this.notification.publish({
      kind: 'booking',
      title: 'Đặt xe thành công',
      message: `Mã nhận xe ${booking.pickupCode} có hiệu lực trong ${PICKUP_HOLD_MINUTES} phút.`,
    });
    return { ok: true, message: 'Đặt xe thành công', booking };
  }

  pickupVehicle(bookingId: string, code: string): OperationResult {
    const state = this.persistence.load();
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== 'reserved') {
      return { ok: false, message: 'Không tìm thấy lượt đặt đang chờ nhận xe' };
    }
    if (booking.expiresAt && new Date(booking.expiresAt).getTime() < Date.now()) {
      this.expireOverdue(Date.now());
      return { ok: false, message: 'Mã nhận xe đã hết hạn. Vui lòng đặt lại xe.' };
    }
    if (booking.pickupCode !== code.trim()) {
      return { ok: false, message: 'Mã nhận xe không đúng. Vui lòng kiểm tra lại.' };
    }

    const now = new Date().toISOString();
    this.persistence.save({
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
      // Xe rời bãi → giải phóng một vị trí trên sơ đồ.
      parkingSlots: releaseUsedSlots(state.parkingSlots, booking.hubId, 1),
    });
    return { ok: true, message: 'Nhận xe thành công' };
  }

  returnVehicle(bookingId: string, code: string): ApiResult<{ durationMinutes?: number }> {
    const state = this.persistence.load();
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

    this.persistence.save({
      bookings: state.bookings.map((item) =>
        item.id === bookingId ? { ...item, status: 'completed', completedAt: now } : item,
      ),
      vehicles: state.vehicles.map((item) =>
        item.id === booking.vehicleId ? { ...item, hubId: hub.id, status: 'available' } : item,
      ),
      hubs: state.hubs.map((item) =>
        item.id === hub.id ? { ...item, occupiedParking: item.occupiedParking + 1 } : item,
      ),
      // Xe vừa trả chiếm một vị trí trên sơ đồ bãi đỗ để hai màn hình luôn khớp nhau.
      parkingSlots: occupyFreeSlots(state.parkingSlots, hub.id, 1),
    });
    this.notification.publish({
      kind: 'booking',
      title: 'Trả xe thành công',
      message: `Thời gian sử dụng ${durationMinutes} phút.`,
    });
    return { ok: true, message: 'Trả xe thành công', durationMinutes };
  }

  cancelBooking(bookingId: string): OperationResult {
    const state = this.persistence.load();
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== 'reserved') {
      return { ok: false, message: 'Chỉ hủy được lượt đặt chưa nhận xe' };
    }
    this.persistence.save({
      bookings: state.bookings.map((item) =>
        item.id === bookingId ? { ...item, status: 'cancelled' } : item,
      ),
      vehicles: state.vehicles.map((item) =>
        item.id === booking.vehicleId ? { ...item, status: 'available' } : item,
      ),
    });
    return { ok: true, message: 'Đã hủy lượt đặt xe' };
  }

  expireOverdue(now: number): number {
    const state = this.persistence.load();
  const expired = state.bookings.filter(
    (b) => b.status === 'reserved' && b.expiresAt && new Date(b.expiresAt).getTime() < now,
  );
  if (expired.length === 0) return 0;

  const ids = new Set(expired.map((b) => b.id));
  const vehicleIds = new Set(expired.map((b) => b.vehicleId));
  this.persistence.save({
    bookings: state.bookings.map((b) => (ids.has(b.id) ? { ...b, status: 'cancelled' } : b)),
    vehicles: state.vehicles.map((v) => (vehicleIds.has(v.id) ? { ...v, status: 'available' } : v)),
  });
  return expired.length;
  }
}
