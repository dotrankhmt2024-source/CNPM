import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData } from '../types/domain';
import { initialData } from '../mocks/seed';
type Store = AppData & {
 reset:()=>void;
 reserveVehicle:(vehicleId:string)=>{ok:boolean;message:string};
 pickupVehicle:(bookingId:string)=>void;
 returnVehicle:(bookingId:string,hubId:string)=>{ok:boolean;message:string};
 cancelBooking:(bookingId:string)=>void;
 reserveParking:(hubId:string)=>{ok:boolean;message:string};
 requestCharging:(vehicleId:string)=>{ok:boolean;message:string};
 dispatchVehicle:(vehicleId:string,toHubId:string)=>{ok:boolean;message:string};
 resolveIncident:(id:string)=>void;
};
const uid=()=>Math.random().toString(36).slice(2,10);
export const useAppStore=create<Store>()(persist((set,get)=>({
 ...initialData,
 reset:()=>set(structuredClone(initialData)),
 reserveVehicle:(vehicleId)=>{
  const state=get(); const vehicle=state.vehicles.find(v=>v.id===vehicleId);
  if(!vehicle||vehicle.status!=='available')return {ok:false,message:'Xe không còn khả dụng'};
  const hub=state.hubs.find(h=>h.id===vehicle.hubId);
  if(!hub)return {ok:false,message:'Không tìm thấy Hub'};
  const booking={id:uid(),vehicleId,hubId:vehicle.hubId,studentName:'Sinh viên demo',status:'reserved' as const,createdAt:new Date().toISOString()};
  set({vehicles:state.vehicles.map(v=>v.id===vehicleId?{...v,status:'reserved'}:v),bookings:[booking,...state.bookings]});
  return {ok:true,message:'Đặt xe thành công'};
 },
 pickupVehicle:(bookingId)=>{
  const s=get();const b=s.bookings.find(x=>x.id===bookingId);if(!b||b.status!=='reserved')return;
  set({bookings:s.bookings.map(x=>x.id===bookingId?{...x,status:'picked_up'}:x),
   vehicles:s.vehicles.map(v=>v.id===b.vehicleId?{...v,status:'in_use'}:v),
   hubs:s.hubs.map(h=>h.id===b.hubId?{...h,occupiedParking:Math.max(0,h.occupiedParking-1)}:h)});
 },
 returnVehicle:(bookingId,hubId)=>{
  const s=get();const b=s.bookings.find(x=>x.id===bookingId),hub=s.hubs.find(x=>x.id===hubId);
  if(!b||b.status!=='picked_up'||!hub)return {ok:false,message:'Không thể trả xe'};
  if(hub.occupiedParking>=hub.capacity)return {ok:false,message:'Hub đã hết chỗ đỗ'};
  set({bookings:s.bookings.map(x=>x.id===bookingId?{...x,status:'completed'}:x),
   vehicles:s.vehicles.map(v=>v.id===b.vehicleId?{...v,hubId,status:'available'}:v),
   hubs:s.hubs.map(h=>h.id===hubId?{...h,occupiedParking:h.occupiedParking+1}:h)});
  return {ok:true,message:'Trả xe thành công'};
 },
 cancelBooking:(bookingId)=>{
  const s=get(),b=s.bookings.find(x=>x.id===bookingId);if(!b||b.status!=='reserved')return;
  set({bookings:s.bookings.map(x=>x.id===bookingId?{...x,status:'cancelled'}:x),vehicles:s.vehicles.map(v=>v.id===b.vehicleId?{...v,status:'available'}:v)});
 },
 reserveParking:(hubId)=>{
  const s=get(),h=s.hubs.find(x=>x.id===hubId);
  if(!h||h.occupiedParking>=h.capacity)return {ok:false,message:'Không còn chỗ đỗ'};
  set({hubs:s.hubs.map(x=>x.id===hubId?{...x,occupiedParking:x.occupiedParking+1}:x)});
  return {ok:true,message:'Đã mô phỏng đặt chỗ đỗ (MVP: chưa có lịch đặt)'};
 },
 requestCharging:(vehicleId)=>{
  const s=get(),v=s.vehicles.find(x=>x.id===vehicleId);
  if(!v||v.status!=='available')return {ok:false,message:'Xe không khả dụng để đăng ký sạc'};
  const h=s.hubs.find(x=>x.id===v.hubId);if(!h)return {ok:false,message:'Không tìm thấy Hub'};
  const canCharge=h.activeCharging<h.chargers;
  set({chargingRequests:[{id:uid(),vehicleId,hubId:v.hubId,priority:100-v.battery,status:canCharge?'charging':'queued'},...s.chargingRequests],
   vehicles:s.vehicles.map(x=>x.id===vehicleId?{...x,status:canCharge?'charging':'available'}:x),
   hubs:s.hubs.map(x=>x.id===h.id&&canCharge?{...x,activeCharging:x.activeCharging+1}:x)});
  return {ok:true,message:canCharge?'Đã bắt đầu phiên sạc mô phỏng':'Đã thêm vào hàng đợi sạc'};
 },
 dispatchVehicle:(vehicleId,toHubId)=>{
  const s=get(),v=s.vehicles.find(x=>x.id===vehicleId),dest=s.hubs.find(x=>x.id===toHubId);
  if(!v||v.status!=='available'||!dest||v.hubId===toHubId)return {ok:false,message:'Không thể điều phối xe'};
  if(dest.occupiedParking>=dest.capacity)return {ok:false,message:'Hub đích đã đầy'};
  set({vehicles:s.vehicles.map(x=>x.id===vehicleId?{...x,hubId:toHubId}:x),
   hubs:s.hubs.map(h=>h.id===v.hubId?{...h,occupiedParking:Math.max(0,h.occupiedParking-1)}:h.id===toHubId?{...h,occupiedParking:h.occupiedParking+1}:h)});
  return {ok:true,message:'Điều phối thành công'};
 },
 resolveIncident:(id)=>set(s=>({incidents:s.incidents.map(i=>i.id===id?{...i,resolved:true}:i)}))
}),{name:'smart-emobility-demo-v1'}));
