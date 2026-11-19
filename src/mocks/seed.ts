import type { AppData, ChargerSlot, Hub, Vehicle } from '../types/domain';

/* Số liệu:
   - 5 Hub của màn "Trung tâm vận hành": A1 (168 xe), B1 (200), B4 (20), C2 (0, cảnh báo), C1 (bảo trì).
   - A4, A5, C3 là các Hub lân cận xuất hiện ở màn Điều phối / Điều hướng (167 / 167 / 17). */
const hubs: Hub[] = [
  { id: 'h1', code: 'A1', name: 'Hub A1', location: 'KTX khu A, ĐHQG TP.HCM', capacity: 67, occupiedParking: 55, chargers: 29, activeCharging: 23, availableVehicles: 168, inUseVehicles: 70, onOverview: true },
  { id: 'h2', code: 'B1', name: 'Hub B1', location: 'KTX khu B, ĐHQG TP.HCM', capacity: 74, occupiedParking: 60, chargers: 43, activeCharging: 35, availableVehicles: 200, inUseVehicles: 80, onOverview: true },
  { id: 'h3', code: 'B4', name: 'Hub B4', location: 'Trường Đại học Bách Khoa TP.HCM', capacity: 24, occupiedParking: 18, chargers: 14, activeCharging: 11, availableVehicles: 20, inUseVehicles: 10, onOverview: true },
  { id: 'h4', code: 'C2', name: 'Hub C2', location: 'Ga metro ĐHQG', capacity: 324, occupiedParking: 324, chargers: 99, activeCharging: 98, faultyChargerNos: [12], availableVehicles: 0, inUseVehicles: 52, onOverview: true, nearbyHubIds: ['h1', 'h6', 'h7', 'h8'] },
  { id: 'h5', code: 'C1', name: 'Hub C1', location: 'Trường Đại học KHTN TP.HCM', capacity: 0, occupiedParking: 0, chargers: 0, activeCharging: 0, availableVehicles: 0, inUseVehicles: 0, maintenance: true, onOverview: true },
  { id: 'h6', code: 'A4', name: 'Hub A4', location: 'KTX khu A, ĐHQG TP.HCM', capacity: 200, occupiedParking: 33, chargers: 30, activeCharging: 8, availableVehicles: 167, inUseVehicles: 20 },
  { id: 'h7', code: 'A5', name: 'Hub A5', location: 'KTX khu A, ĐHQG TP.HCM', capacity: 200, occupiedParking: 33, chargers: 30, activeCharging: 8, availableVehicles: 167, inUseVehicles: 20 },
  { id: 'h8', code: 'C3', name: 'Hub C3', location: 'Trường Đại học Công nghệ thông tin', capacity: 40, occupiedParking: 23, chargers: 10, activeCharging: 2, availableVehicles: 17, inUseVehicles: 3 },
];

/* Danh sách xe cho phần Sinh viên (đặt xe, nhận xe...) – chỉ vài xe mỗi Hub. */
const vehicles: Vehicle[] = [];
['h1', 'h2', 'h3', 'h6', 'h8'].forEach((hubId, hi) => {
  for (let i = 0; i < 4; i++) {
    const n = vehicles.length + 1;
    const type = n % 3 === 0 ? 'motorbike' : 'bike';
    vehicles.push({ id: `v${n}`, code: `${type === 'bike' ? 'EB' : 'EM'}-${String(n).padStart(3, '0')}`, hubId, battery: ((n * 37 + hi * 7) % 70) + 25, status: 'available', type });
  }
});

/* Lịch sạc chi tiết: CS-01 của Hub C2; các cổng còn lại sinh theo cùng mẫu. */
const models = ['VinFast Evo', 'VinFast Feliz', 'VinFast VF-9'];
const figmaCs01: [string, string, number, string][] = [
  ['EV-014', 'VinFast Evo', 75, 'Đang sạc'],
  ['EV-009', 'VinFast Feliz', 34, '14:15'],
  ['XECN', 'VinFast VF-9', 15, '15:00'],
  ['EV-007', 'VinFast Evo', 29, '17:00'],
];
const chargerSlots: ChargerSlot[] = [];
const times = ['Đang sạc', '14:15', '15:00', '17:00'];
for (let c = 1; c <= 20; c++) {
  for (let k = 0; k < 4; k++) {
    const f = c === 1 ? figmaCs01[k] : undefined;
    const n = c * 10 + k;
    chargerSlots.push({
      id: `cs-h4-${c}-${k}`, hubId: 'h4', chargerNo: c,
      vehicleCode: f?.[0] ?? `EV-${String(100 + n).slice(-3)}`,
      model: f?.[1] ?? models[n % 3],
      battery: f?.[2] ?? ((n * 13) % 80) + 10,
      start: f?.[3] ?? times[k],
    });
  }
}

export const initialData: AppData = {
  hubs,
  vehicles,
  bookings: [],
  chargingRequests: [],
  chargerSlots,
  dispatchOrders: [],
  simulationReports: [],
  chargingParams: { lowBatteryThreshold: 20, targetBattery: 90, sharedRatio: '40:60', bufferMinutes: 30, maxChargeMinutes: 240, holdMinutes: 10 },
  incidents: [{ id: 'i1', hubId: 'h4', message: 'HUB C2 · Cổng sạc CS-12 đang bảo trì — cần xử lý', resolved: false }],
};
