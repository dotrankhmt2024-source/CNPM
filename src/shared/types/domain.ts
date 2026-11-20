import type {
  ChargePoint,
  ChargingBooking,
  ChargingConfig,
  ChargingRequest,
  ChargingSession,
} from '@/shared/types/charging';
import type { DispatchOrder, DispatchStaff } from '@/shared/types/dispatch';
import type { RedirectOffer, RedirectPlan } from '@/shared/types/redirect';

export type * from '@/shared/types/charging';
export type * from '@/shared/types/dispatch';
export type * from '@/shared/types/redirect';

/**
 * dispatching: đã được gán vào lệnh điều phối, khóa không cho thuê (Đang điều phối)
 * in_transit:  đang trên đường vận chuyển tới Hub đích
 */
export type VehicleStatus =
  | 'available'
  | 'reserved'
  | 'in_use'
  | 'charging'
  | 'maintenance'
  | 'dispatching'
  | 'in_transit';
export type BookingStatus = 'reserved'|'picked_up'|'completed'|'cancelled';
export type HubStatus = 'normal' | 'warning' | 'maintenance';
export interface Hub { id:string; name:string; location:string; capacity:number; chargers:number; occupiedParking:number; activeCharging:number; status:HubStatus; }
export interface Vehicle { id:string; code:string; model:string; hubId:string; battery:number; status:VehicleStatus; type:'bike'|'motorbike'; }
export interface Booking {
  id: string;
  vehicleId: string;
  hubId: string;
  returnHubId: string;
  studentName: string;
  status: BookingStatus;
  createdAt: string;
  expiresAt: string;
  pickupCode: string;
  startedAt?: string;
  completedAt?: string;
}
export interface Incident { id:string; hubId:string; message:string; resolved:boolean; }

/* ---------- Đặt chỗ đỗ ---------- */
export type ParkingSlotStatus = 'free' | 'used' | 'reserved' | 'maintenance';

export interface ParkingSlot {
  id: string;
  label: string;
  hubId: string;
  zone: string;
  covered: boolean;
  status: ParkingSlotStatus;
}

export interface ParkingReservation {
  id: string;
  hubId: string;
  slotId: string;
  slotLabel: string;
  vehicleType: string;
  startAt: string;
  endAt: string;
  price: number;
  code: string;
  status: 'reserved' | 'cancelled';
}

/* ---------- Đặt lịch sạc ---------- */
export type ChargingPortStatus = 'free' | 'used' | 'reserved';

export interface ChargingPort {
  id: string;
  code: string;
  hubId: string;
  power: number;
  status: ChargingPortStatus;
}

export interface ChargingReservation {
  id: string;
  hubId: string;
  portCode: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  power: number;
  price: number;
  code: string;
  status: 'reserved' | 'cancelled';
}

/* ---------- Lập lịch sạc ưu tiên & điều phối (nhà điều hành): src/types/charging.ts, src/types/dispatch.ts ---------- */

export interface AppData {
  hubs: Hub[];
  vehicles: Vehicle[];
  bookings: Booking[];
  chargingRequests: ChargingRequest[];
  incidents: Incident[];
  parkingSlots: ParkingSlot[];
  parkingReservations: ParkingReservation[];
  chargingPorts: ChargingPort[];
  chargingReservations: ChargingReservation[];
  /** Cổng sạc và lịch sạc theo khung giờ dùng cho lập lịch sạc ưu tiên của nhà điều hành. */
  chargePoints: ChargePoint[];
  chargingBookings: ChargingBooking[];
  chargingSessions: ChargingSession[];
  chargingConfig: ChargingConfig;
  dispatchOrders: DispatchOrder[];
  dispatchStaff: DispatchStaff[];
  /** Phương án điều hướng người dùng và đề xuất gửi tới sinh viên. */
  redirectPlans: RedirectPlan[];
  redirectOffers: RedirectOffer[];
  /** Độ lệch đồng hồ mô phỏng (phút) — dùng để "tua nhanh" thời gian khi demo. */
  clockOffsetMinutes: number;
}
