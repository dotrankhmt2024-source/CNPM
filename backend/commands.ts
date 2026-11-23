/**
 * Bảng lệnh (command) mà client được phép gọi.
 *
 * Mỗi lệnh tương ứng đúng một thao tác ghi của APIGateway ở client.
 */
import type { ServerServices } from './services';

export type CommandResult = { ok: boolean; message: string } & Record<string, unknown>;

type Handler = (services: ServerServices, args: Record<string, unknown>) => unknown;


const str = (args: Record<string, unknown>, key: string) => String(args[key] ?? '');

export const commands: Record<string, Handler> = {
  /* ------------------------------- Sinh viên ------------------------------- */
  'student.reserveVehicle': (s, a) =>
    s.booking.reserveVehicle({ vehicleId: str(a, 'vehicleId'), returnHubId: a.returnHubId as string | undefined }),
  'student.pickupVehicle': (s, a) => s.booking.pickupVehicle(str(a, 'bookingId'), str(a, 'code')),
  'student.returnVehicle': (s, a) => s.booking.returnVehicle(str(a, 'bookingId'), str(a, 'code')),
  'student.cancelBooking': (s, a) => s.booking.cancelBooking(str(a, 'bookingId')),
  'student.bookParking': (s, a) =>
    s.parkingCharging.bookParking({
      hubId: str(a, 'hubId'),
      slotId: str(a, 'slotId'),
      vehicleType: str(a, 'vehicleType'),
      startTime: str(a, 'startTime'),
      endTime: str(a, 'endTime'),
    }),
  'student.cancelParking': (s, a) => s.parkingCharging.cancelParking(str(a, 'reservationId')),
  'student.checkInParking': (s, a) => s.parkingCharging.checkIn(str(a, 'code'), s.auth.currentUser()?.id ?? ''),
  'student.checkOutParking': (s, a) => s.parkingCharging.checkOut(str(a, 'code'), s.auth.currentUser()?.id ?? ''),
  'student.bookChargingSlot': (s, a) => {
    const user = s.auth.currentUser();
    if (!user) return { ok: false, message: 'Vui lòng đăng nhập để đặt lịch sạc.' };
    return s.parkingCharging.book({
      ...(a as unknown as Parameters<ServerServices['parkingCharging']['book']>[0]),
      studentId: user.id,
      studentName: user.fullName,
    });
  },
  'student.cancelChargingSlot': (s, a) => s.scheduling.cancelReservation(str(a, 'bookingId')),
  'student.checkInChargingSlot': (s, a) =>
    s.scheduling.checkInStudent(str(a, 'code'), s.auth.currentUser()?.id ?? ''),
  'student.checkOutChargingSlot': (s, a) =>
    s.scheduling.checkOutStudent(str(a, 'code'), s.auth.currentUser()?.id ?? ''),
  'student.respondToOffer': (s, a) =>
    a.accept ? s.redirection.acceptOffer(str(a, 'offerId')) : s.redirection.rejectOffer(str(a, 'offerId')),
  'student.respondToGeneralNotice': (s, a) => {
    const user = s.auth.currentUser();
    if (!user) return { ok: false, message: 'Chưa đăng nhập.' };
    return s.redirection.respondToGeneralNotice(str(a, 'planId'), user.fullName, Boolean(a.accept));
  },

  /* ----------------------------- Nhà điều hành ---------------------------- */
  'operator.updateHubStatus': (s, a) => s.monitoring.updateHubStatus(str(a, 'hubId'), a.status as never),
  'operator.resolveIncident': (s, a) => s.monitoring.resolveIncident(str(a, 'incidentId')),
  'operator.createDispatchOrder': (s, a) => s.dispatch.createOrder(a as never),
  'operator.assignDispatchStaff': (s, a) => s.dispatch.assignStaff(str(a, 'orderId'), str(a, 'staffId')),
  'operator.startDispatchTransport': (s, a) => s.dispatch.startTransport(str(a, 'orderId')),
  'operator.completeDispatchOrder': (s, a) => s.dispatch.complete(str(a, 'orderId')),
  'operator.cancelDispatchOrder': (s, a) => s.dispatch.cancel(str(a, 'orderId'), str(a, 'reason')),
  'operator.createSmartChargingSchedule': (s, a) => s.scheduling.createSmartSchedule(str(a, 'hubId')),
  'operator.allocateChargingPower': (s, a) => s.scheduling.allocatePower(str(a, 'hubId')),
  'operator.requestCharging': (s, a) =>
    s.scheduling.requestCharging(str(a, 'vehicleId'), (a.options ?? {}) as never),
  'operator.cancelChargingRequest': (s, a) => s.scheduling.cancelRequest(str(a, 'requestId')),
  'operator.setPortMaintenance': (s, a) =>
    s.scheduling.setPortMaintenance(str(a, 'portId'), Boolean(a.underMaintenance)),
  'operator.updateChargingConfig': (s, a) => s.scheduling.updateConfig((a.patch ?? {}) as never),
  'operator.completeChargingSession': (s, a) =>
    s.scheduling.completeSession(str(a, 'sessionId'), a.reason as never),
  'operator.checkInCharging': (s, a) => s.scheduling.checkIn(str(a, 'code'), a.studentId as string | undefined),
  'operator.createChargingReservation': (s, a) => s.scheduling.createReservation(a as never),
  'operator.cancelChargingReservation': (s, a) => s.scheduling.cancelReservation(str(a, 'reservationId')),
  'operator.approveRedirectionPlan': (s, a) => s.redirection.approvePlan(a as never),
  'operator.closeRedirectionPlan': (s, a) => s.redirection.closePlan(str(a, 'planId')),

  /* -------------------------------- Hệ thống ------------------------------- */
  'system.advanceClock': (s, a) => ({ ok: true, message: '', events: s.scheduling.advanceClock(Number(a.minutes ?? 0)) }),
  'system.resetClock': (s) => {
    s.scheduling.resetClock();
    return { ok: true, message: '' };
  },
  'system.tickCharging': (s) => {
    const events = s.scheduling.tick();
    s.parkingCharging.expireOverdue(s.clock.now());
    s.booking.expireOverdue(Date.now());
    return { ok: true, message: '', events };
  },
};

export function runCommand(name: string, args: Record<string, unknown>, services: ServerServices): CommandResult {
  const handler = commands[name];
  if (!handler) return { ok: false, message: `Lệnh không hợp lệ: ${name}` };
  try {
    const result = (handler(services, args) ?? {}) as Record<string, unknown>;
    return {
      ...result,
      ok: Boolean(result.ok),
      message: typeof result.message === 'string' ? result.message : '',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Lỗi không xác định' };
  }
}
