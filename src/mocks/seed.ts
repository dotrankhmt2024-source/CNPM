import type { AppData, ChargingPort, Hub, ParkingSlot } from '../types/domain';

const hubs: Hub[] = [
  { id: 'h1', name: 'HUB A4 - KTX khu A, ĐHQG TPHCM', location: 'Khu vực ga Metro', capacity: 30, chargers: 8, occupiedParking: 10, activeCharging: 2, status: 'normal' },
  { id: 'h2', name: 'HUB B1 - KTX khu B, ĐHQG TPHCM', location: 'Ký túc xá khu B', capacity: 24, chargers: 6, occupiedParking: 7, activeCharging: 1, status: 'normal' },
  { id: 'h3', name: 'HUB C2 - Đại học Bách Khoa', location: 'Khuôn viên trường', capacity: 20, chargers: 4, occupiedParking: 6, activeCharging: 1, status: 'warning' },
  { id: 'h4', name: 'HUB D7 - Thư viện trung tâm', location: 'Khu vực thư viện', capacity: 16, chargers: 4, occupiedParking: 3, activeCharging: 0, status: 'normal' },
];

/**
 * Sinh sơ đồ bãi đỗ: mỗi Hub 3 tầng x 12 vị trí (A01..A36).
 * Trạng thái lấy theo công thức cố định để mỗi lần tải lại vẫn giống nhau.
 */
const buildParkingSlots = (): ParkingSlot[] =>
  hubs.flatMap((hub, hubIndex) =>
    Array.from({ length: 36 }, (_, index) => {
      const floor = Math.floor(index / 12) + 1;
      const label = `A${String(index + 1).padStart(2, '0')}`;
      const seed = (index + hubIndex * 5) % 11;
      const status =
        seed === 2 || seed === 8
          ? 'reserved'
          : seed === 4 || seed === 9
            ? 'used'
            : seed === 10
              ? 'maintenance'
              : 'free';

      return {
        id: `${hub.id}-slot-${index + 1}`,
        label,
        hubId: hub.id,
        zone: `Khu A · Tầng ${floor}`,
        covered: index % 3 === 0,
        status,
      } as ParkingSlot;
    }),
  );

/** Mỗi Hub 8 cổng sạc: CS-01..CS-04 là AC 60kW, CS-05..CS-08 là AC 120kW. */
const buildChargingPorts = (): ChargingPort[] =>
  hubs.flatMap((hub, hubIndex) =>
    Array.from({ length: 8 }, (_, index) => {
      const seed = (index + hubIndex * 3) % 9;
      const status =
        seed === 2 || seed === 7 ? 'reserved' : seed === 4 ? 'used' : 'free';

      return {
        id: `${hub.id}-port-${index + 1}`,
        code: `CS-${String(index + 1).padStart(2, '0')}`,
        hubId: hub.id,
        power: index < 4 ? 60 : 120,
        status,
      } as ChargingPort;
    }),
  );

export const initialData: AppData = {
  hubs,
  vehicles: [
    { id: 'v1', code: 'EV-014', model: 'VinFast Evo', hubId: 'h1', battery: 92, status: 'available', type: 'motorbike' },
    { id: 'v2', code: 'EV-021', model: 'Yadea GS', hubId: 'h1', battery: 78, status: 'available', type: 'motorbike' },
    { id: 'v3', code: 'EV-009', model: 'VinFast Feliz', hubId: 'h1', battery: 64, status: 'available', type: 'motorbike' },
    { id: 'v4', code: 'EV-031', model: 'Yadea Ossy', hubId: 'h1', battery: 55, status: 'available', type: 'motorbike' },
    { id: 'v5', code: 'EV-027', model: 'Pega NewTech', hubId: 'h2', battery: 71, status: 'available', type: 'motorbike' },
    { id: 'v6', code: 'EV-033', model: 'VinFast Vento', hubId: 'h2', battery: 44, status: 'available', type: 'motorbike' },
    { id: 'v7', code: 'EB-003', model: 'VinFast Feliz S', hubId: 'h1', battery: 18, status: 'charging', type: 'bike' },
    { id: 'v8', code: 'EV-041', model: 'VinFast Theon', hubId: 'h3', battery: 66, status: 'available', type: 'motorbike' },
    { id: 'v9', code: 'EB-006', model: 'VinFast Evo Lite', hubId: 'h3', battery: 52, status: 'available', type: 'bike' },
    { id: 'v10', code: 'EV-052', model: 'Yadea G5', hubId: 'h4', battery: 24, status: 'maintenance', type: 'motorbike' },
  ],
  bookings: [],
  chargingRequests: [
    { id: 'c1', vehicleId: 'v1', hubId: 'h1', priority: 25, status: 'charging', scheduledAt: '14:15' },
    { id: 'c2', vehicleId: 'v3', hubId: 'h1', priority: 66, status: 'queued', scheduledAt: '15:00' },
    { id: 'c3', vehicleId: 'v5', hubId: 'h2', priority: 85, status: 'queued', scheduledAt: '17:00' },
  ],
  incidents: [{ id: 'i1', hubId: 'h4', message: 'Xe EV-052 cần kiểm tra kỹ thuật', resolved: false }],
  parkingSlots: buildParkingSlots(),
  parkingReservations: [],
  chargingPorts: buildChargingPorts(),
  chargingReservations: [],
};
