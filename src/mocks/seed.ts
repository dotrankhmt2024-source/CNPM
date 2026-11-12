import type { AppData } from '../types/domain';
export const initialData:AppData = {
 hubs:[
  {id:'h1',name:'Hub Ga Metro ĐHQG',location:'Khu vực ga Metro',capacity:30,chargers:8,occupiedParking:10,activeCharging:2},
  {id:'h2',name:'Hub KTX Khu A',location:'Ký túc xá khu A',capacity:24,chargers:6,occupiedParking:7,activeCharging:1},
  {id:'h3',name:'Hub Đại học Bách Khoa',location:'Khuôn viên trường',capacity:20,chargers:4,occupiedParking:6,activeCharging:1},
  {id:'h4',name:'Hub Thư viện Trung tâm',location:'Khu vực thư viện',capacity:16,chargers:4,occupiedParking:3,activeCharging:0}
 ],
 vehicles:[
  {id:'v1',code:'EB-001',hubId:'h1',battery:84,status:'available',type:'bike'},
  {id:'v2',code:'EM-002',hubId:'h1',battery:42,status:'available',type:'motorbike'},
  {id:'v3',code:'EB-003',hubId:'h1',battery:18,status:'charging',type:'bike'},
  {id:'v4',code:'EB-004',hubId:'h2',battery:91,status:'available',type:'bike'},
  {id:'v5',code:'EM-005',hubId:'h2',battery:63,status:'available',type:'motorbike'},
  {id:'v6',code:'EB-006',hubId:'h2',battery:32,status:'available',type:'bike'},
  {id:'v7',code:'EB-007',hubId:'h3',battery:75,status:'available',type:'bike'},
  {id:'v8',code:'EM-008',hubId:'h3',battery:52,status:'available',type:'motorbike'},
  {id:'v9',code:'EB-009',hubId:'h4',battery:66,status:'available',type:'bike'},
  {id:'v10',code:'EM-010',hubId:'h4',battery:24,status:'maintenance',type:'motorbike'}
 ],
 bookings:[], chargingRequests:[], incidents:[{id:'i1',hubId:'h4',message:'Xe EM-010 cần kiểm tra kỹ thuật',resolved:false}]
};
