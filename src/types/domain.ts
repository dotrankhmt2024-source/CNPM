export type VehicleStatus = 'available'|'reserved'|'in_use'|'charging'|'maintenance';
export type BookingStatus = 'reserved'|'picked_up'|'completed'|'cancelled';
export interface Hub {
  id:string; name:string; location:string; capacity:number; chargers:number; occupiedParking:number; activeCharging:number;
  /** Mã hiển thị, ví dụ 'A1'. */ code?:string;
  /** Số xe khả dụng tại Hub (MobilityHub.availableVehicles). */ availableVehicles?:number;
  /** Số xe của Hub đang được thuê. */ inUseVehicles?:number;
  /** Số thứ tự (1-based) các cổng sạc đang bảo trì. */ faultyChargerNos?:number[];
  /** Hub đang bảo trì: không nhận xe/người dùng. */ maintenance?:boolean;
  /** Hub hiển thị ở màn "Trung tâm vận hành". */ onOverview?:boolean;
  /** Các Hub lân cận (dùng cho gợi ý điều phối / điều hướng). */ nearbyHubIds?:string[];
}
export interface Vehicle { id:string; code:string; hubId:string; battery:number; status:VehicleStatus; type:'bike'|'motorbike'; }
export interface Booking { id:string; vehicleId:string; hubId:string; studentName:string; status:BookingStatus; createdAt:string; }
export interface ChargingRequest { id:string; vehicleId:string; hubId:string; priority:number; status:'queued'|'charging'|'completed'; }
export interface Incident { id:string; hubId:string; message:string; resolved:boolean; }
export type DispatchStatus = 'pending'|'in_transit'|'completed'|'cancelled';
/** kind = 'vehicles': điều phối xe giữa 2 Hub; kind = 'users': điều hướng người dùng sang Hub khác (không di chuyển xe). */
export interface DispatchOrder { id:string; kind:'vehicles'|'users'; operatorName:string; sourceHubId:string; destHubId:string; /** Với kind='users': danh sách Hub thay thế được điều hướng tới. */ destHubIds?:string[]; quantity:number; vehicleIds:string[]; status:DispatchStatus; createdAt:string; completedAt?:string; }
export interface ChargingParams {
  /** Ngưỡng pin cạn cấp bách (%). */ lowBatteryThreshold:number;
  /** Ngưỡng pin mục tiêu khả dụng (%). */ targetBattery:number;
  /** Tỷ lệ ưu tiên xe dùng chung : xe cá nhân, dạng 'a:b'. */ sharedRatio:string;
  /** Thời gian đệm giữa hai lượt sạc (phút). */ bufferMinutes:number;
  /** Thời lượng sạc tối đa (phút). */ maxChargeMinutes:number;
  /** Thời gian giữ chỗ sạc (phút). */ holdMinutes:number;
}
export interface SimulationReport { id:string; savedAt:string; scenarioLabel:string; summary:string; overloadedHubs:number; }
/** Một xe trong lịch sạc của một cổng sạc (màn "Lịch sạc chi tiết"). */
export interface ChargerSlot { id:string; hubId:string; chargerNo:number; vehicleCode:string; model:string; battery:number; start:string; }
export interface AppData { chargerSlots:ChargerSlot[]; hubs:Hub[]; vehicles:Vehicle[]; bookings:Booking[]; chargingRequests:ChargingRequest[]; incidents:Incident[]; dispatchOrders:DispatchOrder[]; chargingParams:ChargingParams; simulationReports:SimulationReport[]; }
