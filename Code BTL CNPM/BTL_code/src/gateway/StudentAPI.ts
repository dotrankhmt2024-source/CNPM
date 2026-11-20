/**
 * StudentAPI — cổng dành cho StudentWebClient.
 *
 * Chỉ định tuyến: đặt xe/huỷ lượt đặt → Mobility (IBooking); chỗ đỗ, cổng sạc →
 * Mobility (IParking/ICharging); tra cứu Hub, xe → NetworkOperations (IMonitoring);
 * đề xuất chuyển Hub → IRedirection.
 */
import type {
  Booking,
  ChargingBooking,
  Hub,
  ParkingReservation,
  ParkingSlot,
  RedirectOffer,
  Vehicle,
} from '@/shared/types/domain';
import type { ApiResult, OperationResult } from '@/contracts/common';
import type { AppNotification } from '@/contracts/AccessIdentity';
import type {
  ChargingSlotState,
  ParkingBookingInput,
  VehicleBookingInput,
} from '@/contracts/Mobility';
import type { ChargingSlotRequest } from '@/contracts/NetworkOperations';
import type { StudentAPI } from '@/contracts/Gateway';
import type { GatewayDeps } from './APIGateway';

export class StudentAPIImpl implements StudentAPI {
  constructor(private readonly deps: GatewayDeps) {}

  /* ------------------------------- Tra cứu ------------------------------- */

  searchHubs(keyword?: string): Hub[] {
    const hubs = this.deps.monitoring.listHubs();
    const query = keyword?.trim().toLowerCase();
    if (!query) return hubs;
    return hubs.filter(
      (hub) => hub.name.toLowerCase().includes(query) || hub.location.toLowerCase().includes(query),
    );
  }

  hubDetail(hubId: string): Hub | null {
    return this.deps.monitoring.hub(hubId);
  }

  availableVehicles(hubId?: string): Vehicle[] {
    return this.deps.monitoring.vehicles(hubId).filter((vehicle) => vehicle.status === 'available');
  }

  parkingSlots(hubId: string): ParkingSlot[] {
    return this.deps.parkingCharging.listSlots(hubId);
  }

  chargingSlots(hubId: string, dateKey: string, startTime: string, durationMinutes: number): ChargingSlotState[] {
    return this.deps.parkingCharging.availability(hubId, dateKey, startTime, durationMinutes);
  }

  myBookings(): Booking[] {
    const user = this.deps.auth.currentUser();
    return user ? this.deps.booking.listByStudent(user.id) : [];
  }

  myParkingReservations(): ParkingReservation[] {
    const user = this.deps.auth.currentUser();
    return user ? this.deps.parkingCharging.listByStudent(user.id) : [];
  }

  myChargingBookings(): ChargingBooking[] {
    const user = this.deps.auth.currentUser();
    return user ? this.deps.parkingCharging.listChargingByStudent(user.id) : [];
  }

  pendingOffers(): RedirectOffer[] {
    return this.deps.redirection.pendingOffers();
  }

  notifications(): AppNotification[] {
    return this.deps.notification.list();
  }

  /* -------------------------------- Lệnh --------------------------------- */

  reserveVehicle(input: VehicleBookingInput): ApiResult<{ booking?: Booking }> {
    return this.deps.booking.reserveVehicle(input);
  }

  pickupVehicle(bookingId: string, code: string): OperationResult {
    return this.deps.booking.pickupVehicle(bookingId, code);
  }

  returnVehicle(bookingId: string, code: string): ApiResult<{ durationMinutes?: number }> {
    return this.deps.booking.returnVehicle(bookingId, code);
  }

  cancelBooking(bookingId: string): OperationResult {
    return this.deps.booking.cancelBooking(bookingId);
  }

  bookParking(input: ParkingBookingInput): ApiResult<{ reservation?: ParkingReservation }> {
    return this.deps.parkingCharging.bookParking(input);
  }

  cancelParking(reservationId: string): OperationResult {
    return this.deps.parkingCharging.cancelParking(reservationId);
  }

  checkInParking(code: string): OperationResult {
    const user = this.deps.auth.currentUser();
    if (!user) return { ok: false, message: 'Vui lòng đăng nhập để lấy chỗ.' };
    return this.deps.parkingCharging.checkIn(code, user.id);
  }

  checkOutParking(code: string): OperationResult {
    const user = this.deps.auth.currentUser();
    if (!user) return { ok: false, message: 'Vui lòng đăng nhập để trả chỗ.' };
    return this.deps.parkingCharging.checkOut(code, user.id);
  }

  checkInChargingSlot(code: string): OperationResult {
    const user = this.deps.auth.currentUser();
    if (!user) return { ok: false, message: 'Vui lòng đăng nhập để lấy chỗ sạc.' };
    return this.deps.scheduling.checkInStudent(code, user.id);
  }

  checkOutChargingSlot(code: string): OperationResult {
    const user = this.deps.auth.currentUser();
    if (!user) return { ok: false, message: 'Vui lòng đăng nhập để trả chỗ sạc.' };
    return this.deps.scheduling.checkOutStudent(code, user.id);
  }

  /** Đặt lịch sạc trên cổng của Hub (dùng chung dữ liệu với màn hình nhà điều hành). */
  bookChargingSlot(input: ChargingSlotRequest): ApiResult<{ booking?: ChargingBooking }> {
    const user = this.deps.auth.currentUser();
    if (!user) return { ok: false, message: 'Vui lòng đăng nhập để đặt lịch sạc.' };
    return this.deps.parkingCharging.book({ ...input, studentId: user.id, studentName: user.fullName });
  }

  cancelChargingSlot(bookingId: string): OperationResult {
    return this.deps.parkingCharging.cancel(bookingId);
  }

  respondToOffer(offerId: string, accept: boolean): ApiResult<{ moved?: boolean; warning?: string }> {
    if (!accept) return this.deps.redirection.rejectOffer(offerId);
    return this.deps.redirection.acceptOffer(offerId);
  }
}
