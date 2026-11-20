/**
 * ParkingChargingService — component của subsystem Mobility.
 *
 * Cài đặt IParking (chỗ đỗ) và ICharging (cổng sạc). Khi giữ chỗ sạc, service đối
 * chiếu với SchedulingService qua IScheduling để không nhận lịch trên cổng đang bảo trì.
 */
import type {
  ChargingBookingInput,
  ICharging,
  IParking,
  ParkingBookingInput,
} from '@/contracts/Mobility';
import type {
  ApiResult,
  INotification,
  IPersistence,
  IScheduling,
  OperationResult,
} from '@/contracts';
import type {
  ChargingPort,
  ChargingReservation,
  ParkingReservation,
  ParkingSlot,
} from '@/shared/types/domain';

const uid = () => Math.random().toString(36).slice(2, 10);

export class ParkingChargingService implements IParking, ICharging {
  constructor(
    private readonly persistence: IPersistence,
    private readonly notification: INotification,
    private readonly scheduling: IScheduling,
  ) {}

  /* ------------------------------ Chỗ đỗ ------------------------------ */

  listSlots(hubId: string): ParkingSlot[] {
    return this.persistence.load().parkingSlots.filter((slot) => slot.hubId === hubId);
  }

  listParkingReservations(): ParkingReservation[] {
    return this.persistence.load().parkingReservations;
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

    this.persistence.save({
      parkingSlots: state.parkingSlots.map((item) =>
        item.id === slotId ? { ...item, status: 'reserved' } : item,
      ),
      parkingReservations: [reservation, ...state.parkingReservations],
    });
    this.notification.publish({
      kind: 'booking',
      title: 'Đặt chỗ đỗ thành công',
      message: `Vị trí ${slot.label}, mã ${reservation.code}.`,
    });
    return { ok: true, message: 'Đặt chỗ đỗ thành công', reservation };
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
    });
    return { ok: true, message: 'Đã hủy chỗ đỗ.' };
  }

  /* ------------------------------ Cổng sạc ----------------------------- */

  listPorts(hubId: string): ChargingPort[] {
    return this.persistence.load().chargingPorts.filter((port) => port.hubId === hubId);
  }

  listChargingReservations(): ChargingReservation[] {
    return this.persistence.load().chargingReservations;
  }

  bookCharging({ hubId, portCode, date, startTime, durationMinutes, power }: ChargingBookingInput): ApiResult<{
    reservation?: ChargingReservation;
  }> {
    const state = this.persistence.load();
    const port = state.chargingPorts.find((item) => item.hubId === hubId && item.code === portCode);
    if (!port || port.status !== 'free') {
      return { ok: false, message: 'Cổng sạc này không còn trống.' };
    }
    // Phối hợp với SchedulingService: cổng đang bảo trì thì không nhận lịch mới.
    const underMaintenance = this.scheduling
      .ports()
      .some((point) => point.hubId === hubId && point.code === portCode && point.underMaintenance);
    if (underMaintenance) {
      return { ok: false, message: `Cổng ${portCode} đang bảo trì, vui lòng chọn cổng khác.` };
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

    this.persistence.save({
      chargingPorts: state.chargingPorts.map((item) =>
        item.id === port.id ? { ...item, status: 'reserved' } : item,
      ),
      chargingReservations: [reservation, ...state.chargingReservations],
    });
    this.notification.publish({
      kind: 'charging',
      title: 'Đặt lịch sạc thành công',
      message: `Cổng ${portCode} lúc ${startTime}, mã ${reservation.code}.`,
    });
    return { ok: true, message: 'Đặt chỗ sạc thành công', reservation };
  }

  cancelCharging(reservationId: string): OperationResult {
    const state = this.persistence.load();
    const reservation = state.chargingReservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== 'reserved') {
      return { ok: false, message: 'Chỉ hủy được lịch sạc đang giữ.' };
    }
    this.persistence.save({
      chargingReservations: state.chargingReservations.map((item) =>
        item.id === reservationId ? { ...item, status: 'cancelled' } : item,
      ),
      chargingPorts: state.chargingPorts.map((item) =>
        item.hubId === reservation.hubId && item.code === reservation.portCode
          ? { ...item, status: 'free' }
          : item,
      ),
    });
    return { ok: true, message: 'Đã hủy lịch sạc.' };
  }
}
