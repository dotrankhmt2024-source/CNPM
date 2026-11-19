import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppData, ChargingParams, DispatchOrder, SimulationReport } from '../types/domain';
import { planDispatch } from '../services/DispatchService';
import { validateChargingParams } from '../services/ChargingService';
import { freeSlots } from '../services/HubService';
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
 createDispatchOrder:(sourceHubId:string,destHubId:string,quantity:number,operatorName:string)=>{ok:boolean;message:string};
 executeDispatchOrder:(orderId:string)=>{ok:boolean;message:string};
 completeDispatchOrder:(orderId:string)=>{ok:boolean;message:string};
 dispatchNow:(sourceHubId:string,destHubId:string,quantity:number,operatorName:string)=>{ok:boolean;message:string};
 redirectUsers:(sourceHubId:string,destHubIds:string[],operatorName:string)=>{ok:boolean;message:string};
 updateChargingParams:(params:ChargingParams)=>{ok:boolean;message:string};
 saveSimulationReport:(report:Omit<SimulationReport,'id'|'savedAt'>)=>void;
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
 resolveIncident:(id)=>set(s=>({incidents:s.incidents.map(i=>i.id===id?{...i,resolved:true}:i)})),

 /* ===== Operator: điều phối xe (PENDING -> IN_TRANSIT -> COMPLETED) – theo số liệu tổng hợp của Hub ===== */
 createDispatchOrder:(sourceHubId,destHubId,quantity,operatorName)=>{
  const s=get();const plan=planDispatch(s,sourceHubId,destHubId,quantity);
  if(!plan.ok)return {ok:false,message:plan.message};
  const order:DispatchOrder={id:'DP-'+uid().toUpperCase().slice(0,5),kind:'vehicles',operatorName,sourceHubId,destHubId,quantity,vehicleIds:[],status:'pending',createdAt:new Date().toISOString()};
  set({dispatchOrders:[order,...s.dispatchOrders]});
  return {ok:true,message:`Đã tạo lệnh ${order.id}`};
 },
 executeDispatchOrder:(orderId)=>{
  const s=get(),o=s.dispatchOrders.find(x=>x.id===orderId);
  if(!o||o.status!=='pending')return {ok:false,message:'Lệnh không ở trạng thái chờ'};
  set({dispatchOrders:s.dispatchOrders.map(x=>x.id===orderId?{...x,status:'in_transit'}:x)});
  return {ok:true,message:'Lệnh điều phối đang vận chuyển'};
 },
 completeDispatchOrder:(orderId)=>{
  const s=get(),o=s.dispatchOrders.find(x=>x.id===orderId);
  if(!o||o.status!=='in_transit')return {ok:false,message:'Lệnh chưa ở trạng thái đang vận chuyển'};
  const plan=planDispatch(s,o.sourceHubId,o.destHubId,o.quantity);
  if(!plan.ok){
   set({dispatchOrders:s.dispatchOrders.map(x=>x.id===orderId?{...x,status:'cancelled'}:x)});
   return {ok:false,message:plan.message};
  }
  set({
   hubs:s.hubs.map(h=>h.id===o.sourceHubId?{...h,availableVehicles:(h.availableVehicles??0)-o.quantity,occupiedParking:Math.max(0,h.occupiedParking-o.quantity)}:h.id===o.destHubId?{...h,availableVehicles:(h.availableVehicles??0)+o.quantity,occupiedParking:h.occupiedParking+o.quantity}:h),
   dispatchOrders:s.dispatchOrders.map(x=>x.id===orderId?{...x,status:'completed',completedAt:new Date().toISOString()}:x)
  });
  return {ok:true,message:`Điều phối ${o.quantity} xe thành công`};
 },

 /** Tạo lệnh và thực thi ngay: PENDING -> IN_TRANSIT -> COMPLETED. */
 dispatchNow:(sourceHubId,destHubId,quantity,operatorName)=>{
  const created=get().createDispatchOrder(sourceHubId,destHubId,quantity,operatorName);
  if(!created.ok)return created;
  const orderId=get().dispatchOrders[0].id;
  get().executeDispatchOrder(orderId);
  return get().completeDispatchOrder(orderId);
 },

 /* ===== Operator: điều hướng người dùng sang các Hub thay thế (không di chuyển xe) ===== */
 redirectUsers:(sourceHubId,destHubIds,operatorName)=>{
  const s=get(),src=s.hubs.find(h=>h.id===sourceHubId);
  const dests=s.hubs.filter(h=>destHubIds.includes(h.id)&&h.id!==sourceHubId&&freeSlots(h)>0);
  if(!src)return {ok:false,message:'Vui lòng chọn Hub quá tải'};
  if(dests.length===0)return {ok:false,message:'Không có Hub thay thế nào còn chỗ trống'};
  const now=new Date().toISOString();
  const order:DispatchOrder={id:'RD-'+uid().toUpperCase().slice(0,5),kind:'users',operatorName,sourceHubId,destHubId:dests[0].id,destHubIds:dests.map(h=>h.id),quantity:0,vehicleIds:[],status:'completed',createdAt:now,completedAt:now};
  set({dispatchOrders:[order,...s.dispatchOrders]});
  return {ok:true,message:`Đã điều hướng người dùng từ ${src.name} sang ${dests.map(h=>h.name).join(', ')}`};
 },

 /* ===== Operator: tham số sạc + báo cáo What-if ===== */
 updateChargingParams:(params)=>{
  const err=validateChargingParams(params);
  if(err)return {ok:false,message:err};
  set({chargingParams:params});
  return {ok:true,message:'Đã cập nhật tham số sạc'};
 },
 saveSimulationReport:(report)=>set(s=>({simulationReports:[{...report,id:'SR-'+uid().toUpperCase().slice(0,5),savedAt:new Date().toISOString()},...s.simulationReports]}))
}),{name:'smart-emobility-demo-v3'}));
