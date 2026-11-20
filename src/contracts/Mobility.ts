/**
 * Hợp đồng của subsystem Mobility: nghiệp vụ sử dụng phương tiện và tài nguyên tại Hub.
 *
 * - BookingService   : IBooking  (đặt xe, nhận xe, trả xe, huỷ lượt đặt)
 * - ParkingChargingService : IParking + ICharging (chỗ đỗ và cổng sạc)
 * - RedirectionService     : IRedirection (điều hướng người dùng sang Hub thay thế —
 *   thao tác trên chính các lượt đặt của Mobility nên nằm trong subsystem này)
 */
import type {
  Booking,
  ChargingPort,
  ChargingReservation,
  ParkingReservation,
  ParkingSlot,
  RedirectOffer,
  RedirectPlan,
  Vehicle,
} from '@/shared/types/domain';
import type { AlternativeHub, OverloadRisk } from '@/shared/domain/redirectMath';
import type { ApiResult, OperationResult } from './common';

export interface VehicleBookingInput {
  vehicleId: string;
  returnHubId?: string;
}

export interface ParkingBookingInput {
  hubId: string;
  slotId: string;
  vehicleType: string;
  startTime: string;
  endTime: string;
}

export interface ChargingBookingInput {
  hubId: string;
  portCode: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  power: number;
}

export interface IBooking {
  list(): Booking[];
  reserveVehicle(input: VehicleBookingInput): ApiResult<{ booking?: Booking }>;
  pickupVehicle(bookingId: string, code: string): OperationResult;
  returnVehicle(bookingId: string, code: string): ApiResult<{ durationMinutes?: number }>;
  cancelBooking(bookingId: string): OperationResult;
}

export interface IParking {
  listSlots(hubId: string): ParkingSlot[];
  listParkingReservations(): ParkingReservation[];
  bookParking(input: ParkingBookingInput): ApiResult<{ reservation?: ParkingReservation }>;
  cancelParking(reservationId: string): OperationResult;
}

export interface ICharging {
  listPorts(hubId: string): ChargingPort[];
  listChargingReservations(): ChargingReservation[];
  bookCharging(input: ChargingBookingInput): ApiResult<{ reservation?: ChargingReservation }>;
  cancelCharging(reservationId: string): OperationResult;
}

export type { AlternativeHub, OverloadRisk };

export interface IRedirection {
  scanOverloadedHubs(): OverloadRisk[];
  findAlternatives(hubId: string, radiusKm: number | null): AlternativeHub[];
  approvePlan(input: {
    overloadedHubId: string;
    targetHubId: string;
    note?: string;
  }): ApiResult<{ plan?: RedirectPlan; offerCount?: number }>;
  closePlan(planId: string): OperationResult;
  acceptOffer(offerId: string): ApiResult<{ moved?: boolean }>;
  rejectOffer(offerId: string): ApiResult<{ warning?: string }>;
  /** Đề xuất còn hiệu lực dành cho sinh viên đang đăng nhập. */
  pendingOffers(): RedirectOffer[];
  vehiclesInHub(hubId: string): Vehicle[];
}
