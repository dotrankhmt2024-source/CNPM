/**
 * StudentAPI — cổng dành cho StudentWebClient.
 *
 * Chỉ định tuyến: đặt xe/huỷ lượt đặt → Mobility (IBooking); chỗ đỗ, cổng sạc →
 * Mobility (IParking/ICharging); tra cứu Hub, xe → NetworkOperations (IMonitoring);
 * đề xuất chuyển Hub → IRedirection.
 */
import type { Booking, ChargingPort, ChargingReservation, Hub, ParkingReservation, ParkingSlot, RedirectOffer, Vehicle } from '@/shared/types/domain';
import type { ApiResult, OperationResult } from '@/contracts/common';
import type { AppNotification } from '@/contracts/AccessIdentity';
import type { ChargingBookingInput, ParkingBookingInput, VehicleBookingInput } from '@/contracts/Mobility';
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

  chargingPorts(hubId: string): ChargingPort[] {
    return this.deps.parkingCharging.listPorts(hubId);
  }

  myBookings(): Booking[] {
    return this.deps.booking.list();
  }

  myParkingReservations(): ParkingReservation[] {
    return this.deps.parkingCharging.listParkingReservations();
  }

  myChargingReservations(): ChargingReservation[] {
    return this.deps.parkingCharging.listChargingReservations();
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

  bookCharging(input: ChargingBookingInput): ApiResult<{ reservation?: ChargingReservation }> {
    return this.deps.parkingCharging.bookCharging(input);
  }

  cancelCharging(reservationId: string): OperationResult {
    return this.deps.parkingCharging.cancelCharging(reservationId);
  }

  respondToOffer(offerId: string, accept: boolean): ApiResult<{ moved?: boolean; warning?: string }> {
    if (!accept) return this.deps.redirection.rejectOffer(offerId);
    return this.deps.redirection.acceptOffer(offerId);
  }
}
