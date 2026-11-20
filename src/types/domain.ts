import type {
  ChargingConfig,
  ChargingPort,
  ChargingRequest,
  ChargingReservation,
  ChargingSession,
  PersonalVehicle,
} from './charging';
import type { DispatchOrder, DispatchStaff } from './dispatch';

export type * from './charging';
export type * from './dispatch';

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

/* ---------- Sạc & điều phối: xem src/types/charging.ts, src/types/dispatch.ts ---------- */

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
  chargingSessions: ChargingSession[];
  chargingConfig: ChargingConfig;
  personalVehicles: PersonalVehicle[];
  dispatchOrders: DispatchOrder[];
  dispatchStaff: DispatchStaff[];
  /** Độ lệch đồng hồ mô phỏng (phút) — dùng để "tua nhanh" thời gian khi demo. */
  clockOffsetMinutes: number;
}
