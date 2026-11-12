import type { AppData } from '../types/domain';
export interface SimulationResult { hubName:string; currentOccupancy:number; projectedOccupancy:number; overflow:number; recommendation:string; }
export function simulateDemand(data:AppData,extraArrivals:number):SimulationResult[]{
 // Pure function: does not mutate the operational state.
 return data.hubs.map(h=>{
  const projectedOccupancy=h.occupiedParking+extraArrivals;
  const overflow=Math.max(0,projectedOccupancy-h.capacity);
  return {hubName:h.name,currentOccupancy:h.occupiedParking,projectedOccupancy,overflow,
   recommendation:overflow>0?`Dự kiến thiếu ${overflow} chỗ; điều hướng sang Hub khác`:'Còn khả năng phục vụ'};
 });
}
