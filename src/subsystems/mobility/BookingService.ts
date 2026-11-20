/**
 * BookingService — component của subsystem Mobility.
 *
 * Cài đặt IBooking: đặt xe, nhận xe bằng mã, trả xe, huỷ lượt đặt.
 * Toàn bộ quy tắc nghiệp vụ nằm ở đây; Client chỉ nhìn thấy kết quả qua APIGateway.
 */
import type { IBooking, VehicleBookingInput } from '@/contracts/Mobility';
import type { ApiResult, INotification, IPersistence, OperationResult } from '@/contracts';
import type { Booking } from '@/shared/types/domain';

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
  ) {}

  list(): Booking[] {
    return this.persistence.load().bookings;
  }

  reserveVehicle({ vehicleId, returnHubId }: VehicleBookingInput): ApiResult<{ booking?: Booking }> {
    const state = this.persistence.load();
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
}
