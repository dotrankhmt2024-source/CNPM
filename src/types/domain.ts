export type VehicleStatus = 'available'|'reserved'|'in_use'|'charging'|'maintenance';
export type BookingStatus = 'reserved'|'picked_up'|'completed'|'cancelled';
export interface Hub { id:string; name:string; location:string; capacity:number; chargers:number; occupiedParking:number; activeCharging:number; }
export interface Vehicle { id:string; code:string; hubId:string; battery:number; status:VehicleStatus; type:'bike'|'motorbike'; }
export interface Booking { id:string; vehicleId:string; hubId:string; studentName:string; status:BookingStatus; createdAt:string; }
export interface ChargingRequest { id:string; vehicleId:string; hubId:string; priority:number; status:'queued'|'charging'|'completed'; }
export interface Incident { id:string; hubId:string; message:string; resolved:boolean; }
export interface AppData { hubs:Hub[]; vehicles:Vehicle[]; bookings:Booking[]; chargingRequests:ChargingRequest[]; incidents:Incident[]; }
