/**
 * ParkingChargingService — component của subsystem Mobility.
 *
 * Cài đặt IParking (chỗ đỗ) và ICharging (cổng sạc). Khi giữ chỗ sạc, service đối
 * chiếu với SchedulingService qua IScheduling để không nhận lịch trên cổng đang bảo trì.
 */
import type {
  ChargingSlotState,
  ICharging,
  IParking,
  ParkingBookingInput,
} from '@/contracts/Mobility';
import type {
  ApiResult,
  IAuth,
  INotification,
  IPersistence,
  IScheduling,
  OperationResult,
} from '@/contracts';
import type { ChargingReservationRequest } from '@/contracts/NetworkOperations';
import type {
  ChargingBooking,
  ParkingReservation,
  ParkingSlot,
} from '@/shared/types/domain';
import { MINUTE, atLocalTime } from '@/shared/clock';

const uid = () => Math.random().toString(36).slice(2, 10);

/** So mã người dùng nhập với mã đã lưu (không phân biệt hoa/thường, bỏ khoảng trắng). */
const sameCode = (stored: string, input: string) =>
  stored.trim().toUpperCase() === input.trim().toUpperCase();

/**
 * Diễn giải thời điểm của một lượt đặt chỗ.
 * Dữ liệu cũ lưu dạng ISO, màn hình đặt chỗ hiện tại lưu dạng "HH:mm" (hôm nay).
 */
function parseBookingTime(value: string, now: number): number {
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return timestamp;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.getTime();
}

/**
 * Đổi "HH:mm" thành thời điểm ISO đầy đủ.
 * Nếu giờ đó đã qua trong hôm nay thì hiểu là ngày mai — nhờ vậy đặt chỗ lúc 23h
 * vẫn không bị coi là "quá giờ" ngay sau khi đặt.
 */
function toBookingInstant(value: string, now: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString();
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return new Date(value).toISOString();
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export class ParkingChargingService implements IParking, ICharging {
  constructor(
    private readonly persistence: IPersistence,
    private readonly notification: INotification,
    private readonly scheduling: IScheduling,
    private readonly auth: IAuth,
  ) {}

  /* ------------------------------ Chỗ đỗ ------------------------------ */

  listSlots(hubId: string): ParkingSlot[] {
    return this.persistence.load().parkingSlots.filter((slot) => slot.hubId === hubId);
  }

  listParkingReservations(): ParkingReservation[] {
    return this.persistence.load().parkingReservations;
  }

  listByStudent(studentId: string): ParkingReservation[] {
    return this.persistence.load().parkingReservations.filter((item) => item.studentId === studentId);
  }
  bookParking({ hubId, slotId, vehicleType, startTime, endTime }: ParkingBookingInput): ApiResult<{
    reservation?: ParkingReservation;
  }> {
    const state = this.persistence.load();
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

    // Lưu thời điểm đầy đủ (ISO) để phân biệt hôm nay / ngày mai khi tính quá giờ.
    const bookedAt = Date.now();
    const startIso = toBookingInstant(startTime, bookedAt);
    const endIsoRaw = toBookingInstant(endTime, bookedAt);
    const endIso =
      Date.parse(endIsoRaw) <= Date.parse(startIso)
        ? new Date(Date.parse(startIso) + 2 * 60 * 60_000).toISOString()
        : endIsoRaw;

    const reservation: ParkingReservation = {
      id: uid(),
      hubId,
      slotId,
      slotLabel: slot.label,
      vehicleType,
      startAt: startIso,
      endAt: endIso,
      price: 5000,
      code: `DO${Math.floor(100000 + Math.random() * 900000)}`,
      studentId: this.auth.currentUser()?.id ?? 'guest',
      studentName: this.auth.currentUser()?.fullName ?? 'Khách',
      status: 'reserved',
    };

    this.persistence.save({
      parkingSlots: state.parkingSlots.map((item) =>
        item.id === slotId ? { ...item, status: 'reserved' } : item,
      ),
      parkingReservations: [reservation, ...state.parkingReservations],
      // Giữ chỗ làm tăng số chỗ đang chiếm → nhà điều hành thấy số chỗ trống giảm ngay.
      hubs: state.hubs.map((hub) =>
        hub.id === hubId
          ? { ...hub, occupiedParking: Math.min(hub.capacity, hub.occupiedParking + 1) }
          : hub,
      ),
    });
    this.notification.publish({
      kind: 'booking',
      title: 'Đặt chỗ đỗ thành công',
      message: `Vị trí ${slot.label}, mã ${reservation.code}.`,
    });
    return { ok: true, message: 'Đặt chỗ đỗ thành công', reservation };
  }

  /**
   * Lấy chỗ đỗ bằng mã đặt chỗ (bước "nhập mã lấy chỗ đậu xe").
   * Vị trí chuyển từ "đã giữ" sang "đang dùng" nên số chỗ trống của Hub không đổi.
   */
  checkIn(code: string, studentId: string): OperationResult {
    const state = this.persistence.load();
    const reservation = state.parkingReservations.find((item) => sameCode(item.code, code));
    if (!reservation) return { ok: false, message: 'Mã lấy chỗ không tồn tại.' };
    if (reservation.studentId !== studentId) {
      return { ok: false, message: 'Mã này không thuộc tài khoản của bạn.' };
    }
    if (reservation.status === 'checked_in') return { ok: false, message: 'Bạn đã lấy chỗ này rồi.' };
    if (reservation.status !== 'reserved') {
      return { ok: false, message: 'Lượt đặt chỗ này không còn hiệu lực để lấy chỗ.' };
    }

    this.persistence.save({
      parkingReservations: state.parkingReservations.map((item) =>
        item.id === reservation.id ? { ...item, status: 'checked_in' } : item,
      ),
      parkingSlots: state.parkingSlots.map((slot) =>
        slot.id === reservation.slotId ? { ...slot, status: 'used' } : slot,
      ),
    });
    this.notification.publish({
      kind: 'booking',
      title: 'Đã lấy chỗ đỗ',
      message: `Vị trí ${reservation.slotLabel} đang được sử dụng.`,
    });
    return { ok: true, message: `Đã lấy chỗ ${reservation.slotLabel}. Chúc bạn đỗ xe thuận lợi!` };
  }

  /** Trả chỗ đỗ bằng mã (bước "nhập mã trả chỗ đậu xe") — giải phóng vị trí cho người khác. */
  checkOut(code: string, studentId: string): OperationResult {
    const state = this.persistence.load();
    const reservation = state.parkingReservations.find((item) => sameCode(item.code, code));
    if (!reservation) return { ok: false, message: 'Mã trả chỗ không tồn tại.' };
    if (reservation.studentId !== studentId) {
      return { ok: false, message: 'Mã này không thuộc tài khoản của bạn.' };
    }
    if (reservation.status !== 'checked_in') {
      return { ok: false, message: 'Chỗ này chưa được lấy hoặc đã trả trước đó.' };
    }

    this.persistence.save({
      parkingReservations: state.parkingReservations.map((item) =>
        item.id === reservation.id ? { ...item, status: 'completed' } : item,
      ),
      parkingSlots: state.parkingSlots.map((slot) =>
        slot.id === reservation.slotId ? { ...slot, status: 'free' } : slot,
      ),
      hubs: state.hubs.map((hub) =>
        hub.id === reservation.hubId
          ? { ...hub, occupiedParking: Math.max(0, hub.occupiedParking - 1) }
          : hub,
      ),
    });
    this.notification.publish({
      kind: 'booking',
      title: 'Đã trả chỗ đỗ',
      message: `Vị trí ${reservation.slotLabel} đã được giải phóng.`,
    });
    return { ok: true, message: `Đã trả chỗ ${reservation.slotLabel}. Vị trí được giải phóng.` };
  }

  cancelParking(reservationId: string): OperationResult {
    const state = this.persistence.load();
    const reservation = state.parkingReservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== 'reserved') {
      return { ok: false, message: 'Chỉ hủy được chỗ đỗ đang giữ.' };
    }
    this.persistence.save({
      parkingReservations: state.parkingReservations.map((item) =>
        item.id === reservationId ? { ...item, status: 'cancelled' } : item,
      ),
      parkingSlots: state.parkingSlots.map((item) =>
        item.id === reservation.slotId ? { ...item, status: 'free' } : item,
      ),
      hubs: state.hubs.map((hub) =>
        hub.id === reservation.hubId
          ? { ...hub, occupiedParking: Math.max(0, hub.occupiedParking - 1) }
          : hub,
      ),
    });
    return { ok: true, message: 'Đã hủy chỗ đỗ.' };
  }

  /**
   * Giải phóng các chỗ đỗ đã quá khung giờ giữ chỗ.
   *
   * Nhờ vậy một lượt đặt từ hôm trước (hoặc từ lần demo trước) không chặn vĩnh viễn
   * việc đặt chỗ mới tại Hub — người dùng không bị kẹt ở nút "Xác nhận đặt chỗ".
   */
  expireOverdue(now: number): number {
    const state = this.persistence.load();
    const overdue = state.parkingReservations.filter((reservation) => {
      if (reservation.status !== 'reserved') return false;
      const end = parseBookingTime(reservation.endAt, now);
      return !Number.isNaN(end) && end <= now;
    });
    if (overdue.length === 0) return 0;

    const expiredIds = new Set(overdue.map((item) => item.id));
    const expiredSlotIds = new Set(overdue.map((item) => item.slotId));
    // Chỉ giải phóng vị trí nếu không còn lượt đặt hiệu lực nào khác giữ nó.
    const stillReserved = new Set(
      state.parkingReservations
        .filter((item) => item.status === 'reserved' && !expiredIds.has(item.id))
        .map((item) => item.slotId),
    );

    // Số vị trí thực sự được giải phóng ở mỗi Hub (để trừ lại occupiedParking).
    const freedByHub = new Map<string, number>();
    state.parkingSlots
      .filter((slot) => expiredSlotIds.has(slot.id) && !stillReserved.has(slot.id) && slot.status === 'reserved')
      .forEach((slot) => freedByHub.set(slot.hubId, (freedByHub.get(slot.hubId) ?? 0) + 1));

    this.persistence.save({
      parkingReservations: state.parkingReservations.map((item) =>
        expiredIds.has(item.id) ? { ...item, status: 'expired' } : item,
      ),
      parkingSlots: state.parkingSlots.map((slot) =>
        expiredSlotIds.has(slot.id) && !stillReserved.has(slot.id) && slot.status === 'reserved'
          ? { ...slot, status: 'free' }
          : slot,
      ),
      hubs: state.hubs.map((hub) =>
        freedByHub.has(hub.id)
          ? { ...hub, occupiedParking: Math.max(0, hub.occupiedParking - (freedByHub.get(hub.id) ?? 0)) }
          : hub,
      ),
    });
    return overdue.length;
  }

  /* ------------------------------ Cổng sạc ----------------------------- */

  availability(hubId: string, dateKey: string, startTime: string, durationMinutes: number): ChargingSlotState[] {
    const start = atLocalTime(dateKey, startTime);
    const end = start + durationMinutes * MINUTE;
    return this.scheduling.portStates(hubId, start, end).map(({ port, status }) => ({ port, status }));
  }

  book(input: ChargingReservationRequest): ApiResult<{ booking?: ChargingBooking }> {
    const result = this.scheduling.createReservation(input);
    if (!result.ok) return result;
    this.notification.publish({
      kind: 'charging',
      title: 'Đặt lịch sạc thành công',
      message: `Cổng ${result.reservation?.portCode} lúc ${input.startTime}, mã ${result.reservation?.code}.`,
    });
    return { ok: true, message: result.message, booking: result.reservation };
  }

  cancel(bookingId: string): OperationResult {
    return this.scheduling.cancelReservation(bookingId);
  }

  listChargingByStudent(studentId: string): ChargingBooking[] {
    return this.scheduling.bookings().filter((booking) => booking.studentId === studentId);
  }
}
