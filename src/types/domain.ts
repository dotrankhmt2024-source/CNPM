export type VehicleStatus = 'available'|'reserved'|'in_use'|'charging'|'maintenance';
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
export interface ChargingRequest { id:string; vehicleId:string; hubId:string; priority:number; status:'queued'|'charging'|'completed'; scheduledAt?:string; }
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
}
