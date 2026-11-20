import type {
  AppData,
  ChargingPort,
  ChargingRequest,
  ChargingReservation,
  ChargingSession,
  DispatchOrder,
  DispatchStaff,
  Hub,
  ParkingSlot,
  PersonalVehicle,
  Vehicle,
} from '../types/domain';
import { DEFAULT_CHARGING_CONFIG, estimateCharge, estimatePrice, syncChargingState } from '../services/chargingScheduler';
import { estimateEtaMinutes, hubDistanceKm } from '../services/dispatchService';
import { MINUTE, formatHm, toDateKey } from '../services/clock';

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

/**
 * Cổng sạc: số cổng mỗi Hub = hub.chargers. Nửa đầu AC 60kW, nửa sau AC 120kW
 * (theo mockup), riêng cổng cuối của HUB A4 và B1 là DC 120kW cho ô tô.
 * Trạng thái (status) được tính lại bởi syncChargingState.
 */
const buildChargingPorts = (): ChargingPort[] =>
  hubs.flatMap((hub) =>
    Array.from({ length: hub.chargers }, (_, index) => {
      const isDc = (hub.id === 'h1' || hub.id === 'h2') && index === hub.chargers - 1;
      return {
        id: `${hub.id}-port-${index + 1}`,
        code: `CS-${String(index + 1).padStart(2, '0')}`,
        hubId: hub.id,
        power: index < Math.ceil(hub.chargers / 2) ? 60 : 120,
        connector: isDc ? 'DC' : 'AC',
        zone: 'Khu A · Tầng 1',
        underMaintenance: false,
        status: 'free',
      } satisfies ChargingPort;
    }),
  );

const baseVehicles: Vehicle[] = [
  { id: 'v1', code: 'EV-014', model: 'VinFast Evo', hubId: 'h1', battery: 92, status: 'available', type: 'motorbike' },
  { id: 'v2', code: 'EV-021', model: 'Yadea GS', hubId: 'h1', battery: 78, status: 'available', type: 'motorbike' },
  { id: 'v3', code: 'EV-009', model: 'VinFast Feliz', hubId: 'h1', battery: 64, status: 'available', type: 'motorbike' },
  { id: 'v4', code: 'EV-031', model: 'Yadea Ossy', hubId: 'h1', battery: 55, status: 'available', type: 'motorbike' },
  { id: 'v5', code: 'EV-027', model: 'Pega NewTech', hubId: 'h2', battery: 71, status: 'available', type: 'motorbike' },
  { id: 'v6', code: 'EV-033', model: 'VinFast Vento', hubId: 'h2', battery: 44, status: 'available', type: 'motorbike' },
  { id: 'v7', code: 'EB-003', model: 'VinFast Feliz S', hubId: 'h1', battery: 18, status: 'charging', type: 'bike' },
  { id: 'v8', code: 'EV-041', model: 'VinFast Theon', hubId: 'h3', battery: 66, status: 'available', type: 'motorbike' },
  { id: 'v9', code: 'EB-006', model: 'VinFast Evo Lite', hubId: 'h3', battery: 52, status: 'charging', type: 'bike' },
  { id: 'v10', code: 'EV-052', model: 'Yadea G5', hubId: 'h4', battery: 24, status: 'maintenance', type: 'motorbike' },
  // HUB C2: bộ dữ liệu cho test case 4.13 / 4.14 (5 xe pin 8, 15, 40, 60, 75%; 3 cổng trống)
  { id: 'v11', code: 'EV-061', model: 'VinFast Evo', hubId: 'h3', battery: 8, status: 'available', type: 'motorbike' },
  { id: 'v12', code: 'EV-062', model: 'Yadea Odora', hubId: 'h3', battery: 15, status: 'available', type: 'motorbike' },
  { id: 'v13', code: 'EB-008', model: 'VinFast Feliz S', hubId: 'h3', battery: 40, status: 'available', type: 'bike' },
  { id: 'v14', code: 'EV-063', model: 'Pega eSH', hubId: 'h3', battery: 60, status: 'available', type: 'motorbike' },
  { id: 'v15', code: 'EV-064', model: 'Yadea G5', hubId: 'h3', battery: 75, status: 'available', type: 'motorbike' },
  // Hai xe đang trên đường điều phối từ HUB B1 sang HUB D7
  { id: 'v16', code: 'EV-071', model: 'VinFast Evo', hubId: 'h2', battery: 88, status: 'in_transit', type: 'motorbike' },
  { id: 'v17', code: 'EV-072', model: 'VinFast Evo', hubId: 'h2', battery: 83, status: 'in_transit', type: 'motorbike' },
];

const personalVehicles: PersonalVehicle[] = [
  { id: 'pv1', ownerId: 'student-001', licensePlate: '51K-888.88', model: 'VinFast VF 8', type: 'car', batteryCapacityKwh: 82 },
  { id: 'pv2', ownerId: 'student-001', licensePlate: '59X1-246.80', model: 'VinFast Klara S', type: 'motorbike', batteryCapacityKwh: 3.5 },
];

const dispatchStaff: DispatchStaff[] = [
  { id: 'st1', name: 'Nguyễn Văn Hùng', phone: '0901 234 567' },
  { id: 'st2', name: 'Trần Quốc Bảo', phone: '0902 345 678' },
  { id: 'st3', name: 'Lê Thị Mai', phone: '0903 456 789' },
];

/** Dữ liệu demo được dựng theo thời điểm hiện tại để lịch luôn "sắp tới". */
export function createInitialData(now = Date.now()): AppData {
  const iso = (time: number) => new Date(time).toISOString();
  const ago = (minutes: number) => now - minutes * MINUTE;
  const config = { ...DEFAULT_CHARGING_CONFIG, updatedAt: iso(now) };
  const ports = buildChargingPorts();
  const portOf = (hubId: string, code: string) => ports.find((port) => port.hubId === hubId && port.code === code)!;

  /** Khung giờ (bội số 30 phút) cách hiện tại ít nhất `minutes`, nằm trong giờ mở cửa. */
  const slotAfter = (minutes: number) => {
    const slot = 30 * MINUTE;
    let start = Math.ceil((now + minutes * MINUTE) / slot) * slot;
    const date = new Date(start);
    if (date.getHours() < config.openHour) date.setHours(config.openHour + 2, 0, 0, 0);
    if (date.getHours() >= config.closeHour - 3) {
      date.setDate(date.getDate() + 1);
      date.setHours(8 + Math.floor(minutes / 60), (minutes % 60 >= 30 ? 30 : 0), 0, 0);
    }
    start = date.getTime();
    return start;
  };

  const makeReservation = (input: {
    id: string;
    code: string;
    studentId: string;
    studentName: string;
    hubId: string;
    portCode: string;
    vehicleKind: 'shared' | 'personal';
    vehicleId: string;
    vehicleLabel: string;
    vehicleType: 'bike' | 'motorbike' | 'car';
    capacity: number;
    current: number;
    target: number;
    start: number;
    status?: ChargingReservation['status'];
  }): ChargingReservation => {
    const port = portOf(input.hubId, input.portCode);
    const estimate = estimateCharge({
      capacityKwh: input.capacity,
      vehicleType: input.vehicleType,
      currentBattery: input.current,
      targetBattery: input.target,
      portPowerKw: port.power,
      slotMinutes: config.slotMinutes,
    });
    return {
      id: input.id,
      code: input.code,
      studentId: input.studentId,
      studentName: input.studentName,
      hubId: input.hubId,
      portId: port.id,
      portCode: port.code,
      vehicleKind: input.vehicleKind,
      vehicleId: input.vehicleId,
      vehicleLabel: input.vehicleLabel,
      batteryCapacityKwh: input.capacity,
      currentBattery: input.current,
      targetBattery: input.target,
      date: toDateKey(input.start),
      startTime: formatHm(input.start),
      startAt: iso(input.start),
      endAt: iso(input.start + estimate.durationMinutes * MINUTE),
      durationMinutes: estimate.durationMinutes,
      power: port.power,
      estimatedEnergyKwh: estimate.energyKwh,
      price: estimatePrice(estimate.energyKwh, config),
      priorityScore: Math.round((100 - input.current) * 0.6 * 10) / 10 + (input.vehicleKind === 'shared' ? 10 : 0),
      status: input.status ?? 'CONFIRMED',
      createdAt: iso(ago(120)),
    };
  };

  const yesterday = ago(24 * 60);
  const chargingReservations: ChargingReservation[] = [
    // Lịch của tài khoản demo, bắt đầu sau 5 phút → có thể check-in ngay (mã cố định để demo).
    makeReservation({
      id: 'rsv-demo-1', code: 'SAC246810', studentId: 'student-001', studentName: 'Sinh viên Demo',
      hubId: 'h1', portCode: 'CS-02', vehicleKind: 'personal', vehicleId: 'pv2',
      vehicleLabel: 'VinFast Klara S · 59X1-246.80', vehicleType: 'motorbike', capacity: 3.5,
      current: 22, target: 85, start: now + 5 * MINUTE,
    }),
    makeReservation({
      id: 'rsv-demo-2', code: 'SAC135790', studentId: 'student-001', studentName: 'Sinh viên Demo',
      hubId: 'h1', portCode: 'CS-08', vehicleKind: 'personal', vehicleId: 'pv1',
      vehicleLabel: 'VinFast VF 8 · 51K-888.88', vehicleType: 'car', capacity: 82,
      current: 30, target: 80, start: slotAfter(180),
    }),
    // Lịch của sinh viên khác để sơ đồ khung giờ có dữ liệu.
    makeReservation({
      id: 'rsv-o1', code: 'SAC500101', studentId: 'student-201', studentName: 'Lê Hoàng Nam',
      hubId: 'h1', portCode: 'CS-01', vehicleKind: 'personal', vehicleId: 'pv-o1',
      vehicleLabel: 'Yadea Voltguard · 59X2-111.22', vehicleType: 'motorbike', capacity: 3.5,
      current: 25, target: 90, start: slotAfter(60),
    }),
    makeReservation({
      id: 'rsv-o2', code: 'SAC500102', studentId: 'student-202', studentName: 'Phạm Thu Hà',
      hubId: 'h1', portCode: 'CS-06', vehicleKind: 'personal', vehicleId: 'pv-o2',
      vehicleLabel: 'VinFast VF 5 · 51L-345.67', vehicleType: 'car', capacity: 37,
      current: 20, target: 80, start: slotAfter(90),
    }),
    makeReservation({
      id: 'rsv-o3', code: 'SAC500103', studentId: 'student-203', studentName: 'Võ Minh Khang',
      hubId: 'h1', portCode: 'CS-03', vehicleKind: 'personal', vehicleId: 'pv-o3',
      vehicleLabel: 'Dat Bike Weaver · 59X3-777.01', vehicleType: 'motorbike', capacity: 4,
      current: 35, target: 95, start: slotAfter(150),
    }),
    makeReservation({
      id: 'rsv-o4', code: 'SAC500104', studentId: 'student-204', studentName: 'Đặng Gia Hân',
      hubId: 'h2', portCode: 'CS-01', vehicleKind: 'personal', vehicleId: 'pv-o4',
      vehicleLabel: 'VinFast Evo200 · 59X1-909.09', vehicleType: 'motorbike', capacity: 3.5,
      current: 15, target: 80, start: slotAfter(60),
    }),
    makeReservation({
      id: 'rsv-o5', code: 'SAC500105', studentId: 'student-205', studentName: 'Bùi Anh Thư',
      hubId: 'h3', portCode: 'CS-01', vehicleKind: 'personal', vehicleId: 'pv-o5',
      vehicleLabel: 'VinFast Feliz · 59X2-555.66', vehicleType: 'motorbike', capacity: 3.5,
      current: 30, target: 80, start: slotAfter(240),
    }),
    // Lịch sử của tài khoản demo
    {
      ...makeReservation({
        id: 'rsv-h1', code: 'SAC112233', studentId: 'student-001', studentName: 'Sinh viên Demo',
        hubId: 'h2', portCode: 'CS-03', vehicleKind: 'personal', vehicleId: 'pv2',
        vehicleLabel: 'VinFast Klara S · 59X1-246.80', vehicleType: 'motorbike', capacity: 3.5,
        current: 18, target: 80, start: yesterday - 120 * MINUTE,
      }),
      status: 'COMPLETED',
      checkedInAt: iso(yesterday - 118 * MINUTE),
      completedAt: iso(yesterday - 10 * MINUTE),
      sessionId: 'ses-h1',
    },
    {
      ...makeReservation({
        id: 'rsv-h2', code: 'SAC445566', studentId: 'student-001', studentName: 'Sinh viên Demo',
        hubId: 'h1', portCode: 'CS-07', vehicleKind: 'personal', vehicleId: 'pv1',
        vehicleLabel: 'VinFast VF 8 · 51K-888.88', vehicleType: 'car', capacity: 82,
        current: 40, target: 80, start: yesterday + 300 * MINUTE,
      }),
      status: 'EXPIRED',
      expiredAt: iso(yesterday + 310 * MINUTE),
      note: 'Không check-in đúng giờ — hệ thống tự hủy và giải phóng cổng.',
    },
  ];

  const session = (input: {
    id: string;
    hubId: string;
    portCode: string;
    vehicleKind: 'shared' | 'personal';
    vehicleId: string;
    vehicleLabel: string;
    ownerName: string;
    capacity: number;
    maxPower: number;
    start: number;
    from: number;
    to: number;
    requestId?: string;
    reservationId?: string;
  }): ChargingSession => {
    const port = portOf(input.hubId, input.portCode);
    const powerKw = Math.min(port.power, input.maxPower);
    const minutes = ((input.capacity * (input.to - input.from)) / 100 / powerKw) * 60;
    // Phải trả cổng trước lịch đặt kế tiếp trên cùng cổng (nếu có).
    const nextBooking = chargingReservations
      .filter((item) => item.portId === port.id && item.status === 'CONFIRMED' && Date.parse(item.startAt) > input.start)
      .map((item) => Date.parse(item.startAt));
    const mustEndBy = Math.min(input.start + config.maxSessionMinutes * MINUTE, ...nextBooking);
    return {
      id: input.id,
      hubId: input.hubId,
      portId: port.id,
      portCode: port.code,
      vehicleKind: input.vehicleKind,
      vehicleId: input.vehicleId,
      vehicleLabel: input.vehicleLabel,
      ownerName: input.ownerName,
      requestId: input.requestId,
      reservationId: input.reservationId,
      batteryCapacityKwh: input.capacity,
      powerKw,
      startBattery: input.from,
      targetBattery: input.to,
      startedAt: iso(input.start),
      expectedFullAt: iso(input.start + minutes * MINUTE),
      mustEndBy: iso(mustEndBy),
      status: 'CHARGING',
    };
  };

  const chargingSessions: ChargingSession[] = [
    session({
      id: 'ses-1', hubId: 'h1', portCode: 'CS-05', vehicleKind: 'shared', vehicleId: 'v7',
      vehicleLabel: 'EB-003 · VinFast Feliz S', ownerName: 'Đội xe dùng chung', capacity: 0.8, maxPower: 0.5,
      start: ago(25), from: 18, to: 80, requestId: 'req-s1',
    }),
    session({
      id: 'ses-2', hubId: 'h1', portCode: 'CS-08', vehicleKind: 'personal', vehicleId: 'pv-o6',
      vehicleLabel: 'VinFast VF 8 · 51G-246.13', ownerName: 'Ngô Thanh Tùng', capacity: 82, maxPower: 150,
      start: ago(30), from: 35, to: 80,
    }),
    session({
      id: 'ses-3', hubId: 'h2', portCode: 'CS-02', vehicleKind: 'personal', vehicleId: 'pv-o7',
      vehicleLabel: 'VinFast Klara S · 59X1-321.45', ownerName: 'Huỳnh Bảo Ngọc', capacity: 3.5, maxPower: 2,
      start: ago(10), from: 30, to: 90,
    }),
    session({
      id: 'ses-4', hubId: 'h3', portCode: 'CS-04', vehicleKind: 'shared', vehicleId: 'v9',
      vehicleLabel: 'EB-006 · VinFast Evo Lite', ownerName: 'Đội xe dùng chung', capacity: 0.8, maxPower: 0.5,
      start: ago(5), from: 52, to: 80, requestId: 'req-s2',
    }),
    {
      ...session({
        id: 'ses-h1', hubId: 'h2', portCode: 'CS-03', vehicleKind: 'personal', vehicleId: 'pv2',
        vehicleLabel: 'VinFast Klara S · 59X1-246.80', ownerName: 'Sinh viên Demo', capacity: 3.5, maxPower: 2,
        start: yesterday - 118 * MINUTE, from: 18, to: 80, reservationId: 'rsv-h1',
      }),
      status: 'COMPLETED',
      endedAt: iso(yesterday - 10 * MINUTE),
      endBattery: 80,
      energyKwh: 2.17,
      cost: estimatePrice(2.17, config),
      endReason: 'full',
    },
  ];

  const request = (input: Partial<ChargingRequest> & Pick<ChargingRequest, 'id' | 'vehicleId' | 'hubId' | 'batteryAtRequest'>): ChargingRequest => ({
    priority: 0,
    status: 'queued',
    source: 'student',
    targetBattery: config.defaultTargetBattery,
    requestedAt: iso(now),
    ...input,
  });

  const chargingRequests: ChargingRequest[] = [
    request({ id: 'req-s1', vehicleId: 'v7', hubId: 'h1', batteryAtRequest: 18, status: 'charging', source: 'auto', requestedAt: iso(ago(30)), sessionId: 'ses-1', scheduledAt: formatHm(ago(25)) }),
    request({ id: 'req-s2', vehicleId: 'v9', hubId: 'h3', batteryAtRequest: 52, status: 'charging', source: 'operator', requestedAt: iso(ago(8)), sessionId: 'ses-4', scheduledAt: formatHm(ago(5)) }),
    request({ id: 'req-c2-40', vehicleId: 'v13', hubId: 'h3', batteryAtRequest: 40, source: 'student', requestedAt: iso(ago(4)) }),
    request({ id: 'req-c2-60', vehicleId: 'v14', hubId: 'h3', batteryAtRequest: 60, source: 'operator', requestedAt: iso(ago(3)) }),
    request({ id: 'req-c2-75', vehicleId: 'v15', hubId: 'h3', batteryAtRequest: 75, source: 'student', targetBattery: 95, requestedAt: iso(ago(2)) }),
    request({
      id: 'req-a4-55', vehicleId: 'v4', hubId: 'h1', batteryAtRequest: 55, source: 'operator',
      requestedAt: iso(ago(6)), neededBy: iso(now + 35 * MINUTE), note: 'Đã có lịch thuê lúc ' + formatHm(now + 35 * MINUTE),
    }),
  ];

  const order = (input: {
    id: string;
    code: string;
    from: string;
    to: string;
    vehicles: [string, string][];
    status: DispatchOrder['status'];
    created: number;
    staff?: DispatchStaff;
    assigned?: number;
    started?: number;
    completed?: number;
    cancelled?: number;
    cancelReason?: string;
    note?: string;
  }): DispatchOrder => {
    const distanceKm = hubDistanceKm(input.from, input.to);
    const etaMinutes = estimateEtaMinutes(distanceKm, input.vehicles.length);
    const actor = 'Nhà điều hành Demo';
    const history: DispatchOrder['history'] = [{ at: iso(input.created), status: 'PENDING', actor, note: 'Tạo lệnh điều phối' }];
    if (input.assigned && input.staff) history.push({ at: iso(input.assigned), status: 'ASSIGNED', actor, note: `Phân công ${input.staff.name}` });
    if (input.started) history.push({ at: iso(input.started), status: 'IN_TRANSIT', actor: input.staff?.name ?? actor, note: 'Xuất phát' });
    if (input.completed) history.push({ at: iso(input.completed), status: 'COMPLETED', actor: input.staff?.name ?? actor, note: `Đã giao đủ ${input.vehicles.length} xe` });
    if (input.cancelled) history.push({ at: iso(input.cancelled), status: 'CANCELLED', actor, note: input.cancelReason });
    return {
      id: input.id,
      code: input.code,
      operatorId: 'operator-001',
      operatorName: actor,
      sourceHubId: input.from,
      destHubId: input.to,
      quantity: input.vehicles.length,
      vehicleIds: input.vehicles.map(([id]) => id),
      vehicleCodes: input.vehicles.map(([, code]) => code),
      status: input.status,
      staffId: input.staff?.id,
      staffName: input.staff?.name,
      note: input.note,
      etaMinutes,
      distanceKm,
      createdAt: iso(input.created),
      assignedAt: input.assigned ? iso(input.assigned) : undefined,
      startedAt: input.started ? iso(input.started) : undefined,
      expectedArrivalAt: input.started ? iso(input.started + etaMinutes * MINUTE) : undefined,
      completedAt: input.completed ? iso(input.completed) : undefined,
      cancelledAt: input.cancelled ? iso(input.cancelled) : undefined,
      cancelReason: input.cancelReason,
      history,
    };
  };

  const [hung, bao, mai] = dispatchStaff;
  const dispatchOrders: DispatchOrder[] = [
    order({
      id: 'dp-5', code: 'DP-0005', from: 'h1', to: 'h4', vehicles: [['v3', 'EV-009']], status: 'PENDING',
      created: ago(2), note: 'Bổ sung xe cho giờ mở cửa thư viện buổi tối',
    }),
    order({
      id: 'dp-4', code: 'DP-0004', from: 'h2', to: 'h4', vehicles: [['v16', 'EV-071'], ['v17', 'EV-072']],
      status: 'IN_TRANSIT', created: ago(20), staff: bao, assigned: ago(15), started: ago(6),
    }),
    order({
      id: 'dp-3', code: 'DP-0003', from: 'h1', to: 'h3', vehicles: [['v8', 'EV-041'], ['v13', 'EB-008']],
      status: 'COMPLETED', created: ago(300), staff: hung, assigned: ago(295), started: ago(290), completed: ago(275),
    }),
    order({
      id: 'dp-2', code: 'DP-0002', from: 'h1', to: 'h3', vehicles: [['v2', 'EV-021'], ['v4', 'EV-031']],
      status: 'CANCELLED', created: yesterday + 200 * MINUTE, staff: mai, assigned: yesterday + 205 * MINUTE,
      cancelled: yesterday + 215 * MINUTE, cancelReason: 'Ga Metro phát sinh nhu cầu cao giờ tan học',
    }),
    order({
      id: 'dp-1', code: 'DP-0001', from: 'h2', to: 'h1', vehicles: [['v1', 'EV-014'], ['v2', 'EV-021'], ['v4', 'EV-031']],
      status: 'COMPLETED', created: yesterday, staff: hung, assigned: yesterday + 3 * MINUTE,
      started: yesterday + 8 * MINUTE, completed: yesterday + 21 * MINUTE,
    }),
  ];

  const vehicles = baseVehicles.map((vehicle) => (vehicle.id === 'v3' ? { ...vehicle, status: 'dispatching' as const } : vehicle));

  const data: AppData = {
    hubs,
    vehicles,
    bookings: [],
    chargingRequests,
    incidents: [{ id: 'i1', hubId: 'h4', message: 'Xe EV-052 cần kiểm tra kỹ thuật', resolved: false }],
    parkingSlots: buildParkingSlots(),
    parkingReservations: [],
    chargingPorts: ports,
    chargingReservations,
    chargingSessions,
    chargingConfig: config,
    personalVehicles,
    dispatchOrders,
    dispatchStaff,
    clockOffsetMinutes: 0,
  };
  return { ...data, ...syncChargingState(data, now) };
}

export const initialData: AppData = createInitialData();
