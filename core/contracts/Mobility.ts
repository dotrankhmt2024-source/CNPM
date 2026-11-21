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
  ChargePoint,
  ChargingBooking,
  ParkingReservation,
  ParkingSlot,
  RedirectOffer,
  RedirectPlan,
  Vehicle,
} from '@/shared/types/domain';
import type { AlternativeHub, OverloadRisk } from '@/shared/domain/redirectMath';
import type { ApiResult, OperationResult } from './common';
import type { ChargingReservationRequest } from './NetworkOperations';

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

export interface IBooking {
  list(): Booking[];
  /** Lượt đặt của riêng một tài khoản (màn hình sinh viên chỉ thấy dữ liệu của mình). */
  listByStudent(studentId: string): Booking[];
  reserveVehicle(input: VehicleBookingInput): ApiResult<{ booking?: Booking }>;
  pickupVehicle(bookingId: string, code: string): OperationResult;
  returnVehicle(bookingId: string, code: string): ApiResult<{ durationMinutes?: number }>;
  cancelBooking(bookingId: string): OperationResult;
}

export interface IParking {
  listSlots(hubId: string): ParkingSlot[];
  listParkingReservations(): ParkingReservation[];
  listByStudent(studentId: string): ParkingReservation[];  bookParking(input: ParkingBookingInput): ApiResult<{ reservation?: ParkingReservation }>;
  cancelParking(reservationId: string): OperationResult;
  /** Lấy chỗ đỗ bằng mã đặt chỗ. */
  checkIn(code: string, studentId: string): OperationResult;
  /** Trả chỗ đỗ bằng mã — giải phóng vị trí. */
  checkOut(code: string, studentId: string): OperationResult;
  /** Giải phóng các chỗ đỗ đã quá khung giờ giữ chỗ; trả về số lượt được giải phóng. */
  expireOverdue(now: number): number;
}

export type ChargingSlotStatus = 'free' | 'reserved' | 'used' | 'maintenance';

/** Trạng thái một cổng sạc trong khung giờ mà sinh viên đang chọn. */
export interface ChargingSlotState {
  port: ChargePoint;
  status: ChargingSlotStatus;
}

/**
 * ICharging: đăng ký sạc trên chính các cổng sạc (ChargePoint) mà nhà điều hành
 * đang quản lý — nhờ vậy lịch đặt của sinh viên hiện ngay bên màn hình lập lịch sạc.
 * Xe đem đi sạc là **xe cá nhân** do sinh viên tự khai báo.
 */
export interface ICharging {
  availability(
    hubId: string,
    dateKey: string,
    startTime: string,
    durationMinutes: number,
  ): ChargingSlotState[];
  book(input: ChargingReservationRequest): ApiResult<{ booking?: ChargingBooking }>;
  cancel(bookingId: string): OperationResult;
  listChargingByStudent(studentId: string): ChargingBooking[];
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
  /** Phản hồi gợi ý chung của phương án điều hướng đang hiệu lực. */
  respondToGeneralNotice(planId: string, studentName: string, accept: boolean): ApiResult<{ warning?: string }>;
  /** Đề xuất còn hiệu lực dành cho sinh viên đang đăng nhập. */
  pendingOffers(): RedirectOffer[];
  vehiclesInHub(hubId: string): Vehicle[];
}
