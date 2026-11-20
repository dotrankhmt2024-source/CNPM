/**
 * ChargingScheduler — logic nghiệp vụ thuần (pure functions) của phân hệ sạc.
 *
 * Gồm 3 nhóm chức năng được giao:
 *  1. Lịch sạc theo khung giờ (ChargingReservationController):
 *     checkChargerAvailability, createChargingReservation, cancelReservation,
 *     validateCheckIn, processTimeoutReservations.
 *  2. Bộ lập lịch sạc thông minh ưu tiên (SmartChargingController + PriorityChargingQueue):
 *     calculatePriorityScore, prioritizeVehicles, createSmartChargingSchedule,
 *     allocateChargingPower, getOverflowVehicles, processQueueOverflow.
 *  3. Phiên sạc (ChargingSession): startSession, theo dõi tiến độ, stopSession/hoàn tất.
 *
 * Mọi hàm nhận state + thời điểm `now` (ms) và TRẢ VỀ state mới, không sửa state cũ.
 * Nhờ vậy store chỉ việc `set(...)`, còn unit test gọi trực tiếp không cần React.
 */
import type {
  AppData,
  ChargeVehicleKind,
  ChargingConfig,
  ChargingEndReason,
  ChargingPort,
  ChargingPortStatus,
  ChargingRequest,
  ChargingRequestSource,
  ChargingReservation,
  ChargingSession,
  ConnectorType,
  Hub,
  PersonalVehicleType,
  Vehicle,
} from '../types/domain';
import { MINUTE, atLocalTime, formatHm } from './clock';

/* ------------------------------------------------------------------ */
/* Kiểu dữ liệu                                                        */
/* ------------------------------------------------------------------ */

export type ChargingState = Pick<
  AppData,
  | 'hubs'
  | 'vehicles'
  | 'bookings'
  | 'chargingPorts'
  | 'chargingReservations'
  | 'chargingSessions'
  | 'chargingRequests'
  | 'chargingConfig'
>;

export type OpResult<T = unknown> =
  | ({ ok: true; message: string; state: ChargingState } & T)
  | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

let idCounter = 0;
export const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const makeCode = (prefix: string) => `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;

const iso = (time: number) => new Date(time).toISOString();
const ms = (time: string) => new Date(time).getTime();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ */
/* Cấu hình & thông số phương tiện                                     */
/* ------------------------------------------------------------------ */

export const DEFAULT_CHARGING_CONFIG: ChargingConfig = {
  lowBatteryThreshold: 20,
  criticalBatteryThreshold: 10,
  defaultTargetBattery: 80,
  timeWindowMinutes: 60,
  slotMinutes: 30,
  maxSessionMinutes: 240,
  holdMinutes: 10,
  earlyCheckInMinutes: 10,
  openHour: 6,
  closeHour: 22,
  pricePerKwh: 3500,
  bookingFee: 10000,
  autoAllocate: true,
  updatedAt: new Date(0).toISOString(),
};

export interface VehicleProfile {
  label: string;
  capacityKwh: number;
  /** Công suất sạc tối đa xe nhận được (kW). */
  maxPowerKw: number;
  connectors: ConnectorType[];
}

/** Thông số mặc định theo loại xe (dùng cho xe dùng chung và xe cá nhân chưa khai báo). */
export const VEHICLE_PROFILES: Record<PersonalVehicleType, VehicleProfile> = {
  bike: { label: 'Xe đạp điện', capacityKwh: 0.8, maxPowerKw: 0.5, connectors: ['AC'] },
  motorbike: { label: 'Xe máy điện', capacityKwh: 3.5, maxPowerKw: 2, connectors: ['AC'] },
  car: { label: 'Ô tô điện', capacityKwh: 60, maxPowerKw: 150, connectors: ['AC', 'DC'] },
};

export const isConnectorCompatible = (type: PersonalVehicleType, connector: ConnectorType) =>
  VEHICLE_PROFILES[type].connectors.includes(connector);

export interface ChargeEstimate {
  energyKwh: number;
  powerKw: number;
  /** Thời gian sạc thực tế để đạt mức mục tiêu (phút). */
  chargeMinutes: number;
  /** Thời lượng giữ cổng, làm tròn lên bội số khung giờ (phút). */
  durationMinutes: number;
}

/** Ước tính năng lượng và thời lượng sạc. */
export function estimateCharge(input: {
  capacityKwh: number;
  vehicleType: PersonalVehicleType;
  currentBattery: number;
  targetBattery: number;
  portPowerKw: number;
  slotMinutes: number;
}): ChargeEstimate {
  const energyKwh = (input.capacityKwh * Math.max(0, input.targetBattery - input.currentBattery)) / 100;
  const powerKw = Math.min(input.portPowerKw, VEHICLE_PROFILES[input.vehicleType].maxPowerKw);
  const chargeMinutes = powerKw > 0 ? (energyKwh / powerKw) * 60 : 0;
  const slots = Math.max(1, Math.ceil(chargeMinutes / input.slotMinutes));
  return {
    energyKwh: round2(energyKwh),
    powerKw,
    chargeMinutes: Math.ceil(chargeMinutes),
    durationMinutes: slots * input.slotMinutes,
  };
}

export const estimatePrice = (energyKwh: number, config: ChargingConfig, withBookingFee = true) =>
  Math.round(energyKwh * config.pricePerKwh + (withBookingFee ? config.bookingFee : 0));

/* ------------------------------------------------------------------ */
/* Điểm ưu tiên (calculatePriorityScore)                               */
/* ------------------------------------------------------------------ */

export interface PriorityBreakdown {
  /** (100 − pin) × 0,6 → tối đa 60 điểm. */
  battery: number;
  /** +15 nếu pin ≤ ngưỡng nguy cấp. */
  critical: number;
  /** Tối đa +25 nếu xe cần dùng trong cửa sổ thời gian (càng gần càng cao). */
  upcoming: number;
  /** +10 cho xe dùng chung (phục vụ nhiều người). */
  shared: number;
  /** +1 điểm cho mỗi 6 phút chờ, tối đa +10 (chống "đói" hàng đợi). */
  waiting: number;
}

export function calculatePriorityScore(input: {
  battery: number;
  isShared: boolean;
  minutesToNextUse: number | null;
  waitedMinutes: number;
  config: Pick<ChargingConfig, 'criticalBatteryThreshold' | 'timeWindowMinutes'>;
}): { score: number; breakdown: PriorityBreakdown } {
  const battery = clamp(input.battery, 0, 100);
  const window = Math.max(1, input.config.timeWindowMinutes);
  const upcoming =
    input.minutesToNextUse !== null && input.minutesToNextUse <= window
      ? 5 + 20 * (1 - clamp(input.minutesToNextUse, 0, window) / window)
      : 0;
  const breakdown: PriorityBreakdown = {
    battery: round1((100 - battery) * 0.6),
    critical: battery <= input.config.criticalBatteryThreshold ? 15 : 0,
    upcoming: round1(upcoming),
    shared: input.isShared ? 10 : 0,
    waiting: round1(Math.min(10, Math.max(0, input.waitedMinutes) / 6)),
  };
  const score = round1(
    breakdown.battery + breakdown.critical + breakdown.upcoming + breakdown.shared + breakdown.waiting,
  );
  return { score, breakdown };
}

/* ------------------------------------------------------------------ */
/* Bận / rảnh của cổng sạc theo khung thời gian                        */
/* ------------------------------------------------------------------ */

const isLiveSession = (session: ChargingSession) =>
  session.status === 'CHARGING' || session.status === 'FULL';

/** Khoảng thời gian một phiên đang chạy còn chiếm cổng. */
function sessionBusyUntil(session: ChargingSession, now: number) {
  if (session.status === 'FULL') return now + MINUTE;
  const plannedEnd = Math.min(
    ms(session.expectedFullAt),
    session.mustEndBy ? ms(session.mustEndBy) : Number.POSITIVE_INFINITY,
  );
  return Math.max(now + MINUTE, plannedEnd);
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/** Trạng thái của một cổng trong khoảng [start, end). */
export function getPortStateInWindow(
  state: Pick<ChargingState, 'chargingReservations' | 'chargingSessions'>,
  port: ChargingPort,
  start: number,
  end: number,
  now: number,
  excludeReservationId?: string,
): 'free' | 'reserved' | 'used' | 'maintenance' {
  if (port.underMaintenance) return 'maintenance';
  const busySession = state.chargingSessions.some(
    (session) =>
      session.portId === port.id &&
      isLiveSession(session) &&
      overlaps(start, end, ms(session.startedAt), sessionBusyUntil(session, now)),
  );
  if (busySession) return 'used';
  const busyReservation = state.chargingReservations.some(
    (reservation) =>
      reservation.portId === port.id &&
      reservation.id !== excludeReservationId &&
      reservation.status === 'CONFIRMED' &&
      overlaps(start, end, ms(reservation.startAt), ms(reservation.endAt)),
  );
  return busyReservation ? 'reserved' : 'free';
}

/**
 * checkChargerAvailability: danh sách cổng còn trống trong khung giờ,
 * phù hợp đầu nối và không xung đột lịch.
 */
export function checkChargerAvailability(
  state: Pick<ChargingState, 'chargingPorts' | 'chargingReservations' | 'chargingSessions'>,
  input: { hubId: string; start: number; end: number; connectors?: ConnectorType[]; now: number },
): ChargingPort[] {
  return state.chargingPorts.filter(
    (port) =>
      port.hubId === input.hubId &&
      (!input.connectors || input.connectors.includes(port.connector)) &&
      getPortStateInWindow(state, port, input.start, input.end, input.now) === 'free',
  );
}

export interface SlotOption {
  label: string;
  start: number;
  end: number;
  /** Đã qua (không còn kịp check-in) hoặc vượt giờ đóng cửa. */
  disabled: boolean;
  freePorts: number;
  totalPorts: number;
}

/** Danh sách khung giờ bắt đầu sạc trong ngày cùng số cổng còn trống của từng khung. */
export function buildSlotOptions(
  state: Pick<ChargingState, 'chargingPorts' | 'chargingReservations' | 'chargingSessions' | 'chargingConfig'>,
  input: {
    hubId: string;
    dateKey: string;
    durationMinutes: number;
    connectors?: ConnectorType[];
    now: number;
  },
): SlotOption[] {
  const { slotMinutes, openHour, closeHour, holdMinutes } = state.chargingConfig;
  const total = state.chargingPorts.filter(
    (port) =>
      port.hubId === input.hubId && (!input.connectors || input.connectors.includes(port.connector)),
  ).length;
  const options: SlotOption[] = [];
  const dayClose = atLocalTime(input.dateKey, `${String(closeHour).padStart(2, '0')}:00`);
  for (let minute = openHour * 60; minute + slotMinutes <= closeHour * 60; minute += slotMinutes) {
    const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const start = atLocalTime(input.dateKey, label);
    const end = start + input.durationMinutes * MINUTE;
    const disabled = start + holdMinutes * MINUTE <= input.now || end > dayClose;
    const freePorts = disabled
      ? 0
      : checkChargerAvailability(state, {
          hubId: input.hubId,
          start,
          end,
          connectors: input.connectors,
          now: input.now,
        }).length;
    options.push({ label, start, end, disabled, freePorts, totalPorts: total });
  }
  return options;
}

/** Hub thay thế còn cổng trống trong cùng khung giờ (Extension 4.1 / 5.1). */
export function findAlternativeHubs(
  state: Pick<ChargingState, 'hubs' | 'chargingPorts' | 'chargingReservations' | 'chargingSessions'>,
  input: { excludeHubId: string; start: number; end: number; connectors?: ConnectorType[]; now: number },
): { hub: Hub; freePorts: number }[] {
  return state.hubs
    .filter((hub) => hub.id !== input.excludeHubId && hub.status !== 'maintenance')
    .map((hub) => ({
      hub,
      freePorts: checkChargerAvailability(state, { ...input, hubId: hub.id }).length,
    }))
    .filter((item) => item.freePorts > 0)
    .sort((a, b) => b.freePorts - a.freePorts);
}

/* ------------------------------------------------------------------ */
/* Tiến độ phiên sạc                                                   */
/* ------------------------------------------------------------------ */

/** Mức pin hiện tại của phiên sạc (nội suy tuyến tính theo thời gian). */
export function sessionBatteryAt(session: ChargingSession, now: number) {
  if (session.status === 'COMPLETED') return session.endBattery ?? session.targetBattery;
  const start = ms(session.startedAt);
  const full = ms(session.expectedFullAt);
  if (full <= start) return session.targetBattery;
  const progress = clamp((now - start) / (full - start), 0, 1);
  return round1(session.startBattery + (session.targetBattery - session.startBattery) * progress);
}

export const sessionEnergyAt = (session: ChargingSession, now: number) =>
  round2((session.batteryCapacityKwh * Math.max(0, sessionBatteryAt(session, now) - session.startBattery)) / 100);

/* ------------------------------------------------------------------ */
/* Đồng bộ trạng thái cổng / Hub                                       */
/* ------------------------------------------------------------------ */

/** Tính lại trạng thái hiển thị của cổng, số cổng đang dùng của Hub; đánh dấu phiên đã đầy. */
export function syncChargingState(state: ChargingState, now: number): ChargingState {
  const sessions = state.chargingSessions.map((session) =>
    session.status === 'CHARGING' && now >= ms(session.expectedFullAt)
      ? { ...session, status: 'FULL' as const, fullAt: session.expectedFullAt }
      : session,
  );
  const { earlyCheckInMinutes, holdMinutes } = state.chargingConfig;
  const ports = state.chargingPorts.map((port) => {
    let status: ChargingPortStatus = 'free';
    const live = sessions.find((session) => session.portId === port.id && isLiveSession(session));
    if (port.underMaintenance) status = 'maintenance';
    else if (live) status = live.status === 'FULL' ? 'full' : 'used';
    else if (
      state.chargingReservations.some(
        (reservation) =>
          reservation.portId === port.id &&
          reservation.status === 'CONFIRMED' &&
          now >= ms(reservation.startAt) - earlyCheckInMinutes * MINUTE &&
          now < ms(reservation.startAt) + holdMinutes * MINUTE,
      )
    )
      status = 'reserved';
    return port.status === status ? port : { ...port, status };
  });
  const hubs = state.hubs.map((hub) => {
    const hubPorts = ports.filter((port) => port.hubId === hub.id);
    if (hubPorts.length === 0) return hub;
    const active = sessions.filter((session) => session.hubId === hub.id && isLiveSession(session)).length;
    return hub.chargers === hubPorts.length && hub.activeCharging === active
      ? hub
      : { ...hub, chargers: hubPorts.length, activeCharging: active };
  });
  return { ...state, chargingSessions: sessions, chargingPorts: ports, hubs };
}

/* ------------------------------------------------------------------ */
/* 1. LỊCH SẠC THEO KHUNG GIỜ                                          */
/* ------------------------------------------------------------------ */

export interface ReservationInput {
  studentId: string;
  studentName: string;
  hubId: string;
  portId: string;
  vehicleKind: ChargeVehicleKind;
  vehicleId: string;
  vehicleLabel: string;
  vehicleType: PersonalVehicleType;
  batteryCapacityKwh: number;
  currentBattery: number;
  targetBattery: number;
  /** YYYY-MM-DD */
  dateKey: string;
  /** HH:mm */
  startTime: string;
}

/** createChargingReservation: kiểm tra hợp lệ, chống trùng lịch, tính ưu tiên, giữ khung giờ. */
export function createChargingReservation(
  state: ChargingState,
  input: ReservationInput,
  now: number,
): OpResult<{ reservation: ChargingReservation }> {
  const config = state.chargingConfig;
  const hub = state.hubs.find((item) => item.id === input.hubId);
  if (!hub) return fail('Không tìm thấy Hub.');
  if (hub.status === 'maintenance') return fail('Hub đang tạm ngưng để bảo trì.');
  const port = state.chargingPorts.find((item) => item.id === input.portId && item.hubId === hub.id);
  if (!port) return fail('Không tìm thấy cổng sạc tại Hub này.');
  if (port.underMaintenance) return fail(`Cổng ${port.code} đang bảo trì, vui lòng chọn cổng khác.`);
  if (!isConnectorCompatible(input.vehicleType, port.connector)) {
    return fail(`Cổng ${port.code} (${port.connector}) không tương thích với loại xe đã chọn.`);
  }
  if (
    !Number.isFinite(input.currentBattery) ||
    !Number.isFinite(input.targetBattery) ||
    input.currentBattery < 0 ||
    input.targetBattery > 100 ||
    input.currentBattery >= input.targetBattery
  ) {
    return fail('Mức pin không hợp lệ: cần 0 ≤ pin hiện tại < pin mục tiêu ≤ 100.');
  }

  const start = atLocalTime(input.dateKey, input.startTime);
  if (Number.isNaN(start)) return fail('Khung giờ không hợp lệ.');
  if (start + config.holdMinutes * MINUTE <= now) return fail('Khung giờ đã qua, vui lòng chọn khung giờ khác.');
  const estimate = estimateCharge({
    capacityKwh: input.batteryCapacityKwh,
    vehicleType: input.vehicleType,
    currentBattery: input.currentBattery,
    targetBattery: input.targetBattery,
    portPowerKw: port.power,
    slotMinutes: config.slotMinutes,
  });
  if (estimate.durationMinutes > config.maxSessionMinutes) {
    return fail(
      `Thời lượng sạc dự kiến (${estimate.durationMinutes} phút) vượt mức tối đa ${config.maxSessionMinutes} phút. Hãy giảm mức pin mục tiêu.`,
    );
  }
  const end = start + estimate.durationMinutes * MINUTE;
  const [startHour] = input.startTime.split(':').map(Number);
  const closeAt = atLocalTime(input.dateKey, `${String(config.closeHour).padStart(2, '0')}:00`);
  if (startHour < config.openHour || end > closeAt) {
    return fail(`Hub nhận lịch sạc từ ${config.openHour}:00 đến ${config.closeHour}:00.`);
  }

  const portState = getPortStateInWindow(state, port, start, end, now);
  if (portState !== 'free') {
    return fail(`Khung giờ đã đầy: cổng ${port.code} đã có lịch trong khoảng thời gian này.`);
  }
  const vehicleClash = state.chargingReservations.some(
    (reservation) =>
      reservation.vehicleId === input.vehicleId &&
      (reservation.status === 'CONFIRMED' || reservation.status === 'CHECKED_IN') &&
      overlaps(start, end, ms(reservation.startAt), ms(reservation.endAt)),
  );
  if (vehicleClash) return fail('Xe này đã có một lịch sạc khác trùng khung giờ.');

  const { score } = calculatePriorityScore({
    battery: input.currentBattery,
    isShared: input.vehicleKind === 'shared',
    minutesToNextUse: null,
    waitedMinutes: 0,
    config,
  });

  const reservation: ChargingReservation = {
    id: makeId('rsv'),
    code: makeCode('SAC'),
    studentId: input.studentId,
    studentName: input.studentName,
    hubId: hub.id,
    portId: port.id,
    portCode: port.code,
    vehicleKind: input.vehicleKind,
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    batteryCapacityKwh: input.batteryCapacityKwh,
    currentBattery: input.currentBattery,
    targetBattery: input.targetBattery,
    date: input.dateKey,
    startTime: input.startTime,
    startAt: iso(start),
    endAt: iso(end),
    durationMinutes: estimate.durationMinutes,
    power: port.power,
    estimatedEnergyKwh: estimate.energyKwh,
    price: estimatePrice(estimate.energyKwh, config),
    priorityScore: score,
    status: 'CONFIRMED',
    createdAt: iso(now),
  };
  const next = syncChargingState(
    { ...state, chargingReservations: [reservation, ...state.chargingReservations] },
    now,
  );
  return { ok: true, message: 'Đặt lịch sạc thành công.', state: next, reservation };
}

/** cancelReservation: chỉ hủy được lịch chưa check-in. */
export function cancelChargingReservation(
  state: ChargingState,
  reservationId: string,
  now: number,
): OpResult {
  const reservation = state.chargingReservations.find((item) => item.id === reservationId);
  if (!reservation) return fail('Không tìm thấy lịch sạc.');
  if (reservation.status !== 'CONFIRMED') return fail('Chỉ hủy được lịch sạc chưa check-in.');
  const next = syncChargingState(
    {
      ...state,
      chargingReservations: state.chargingReservations.map((item) =>
        item.id === reservationId ? { ...item, status: 'CANCELLED', cancelledAt: iso(now) } : item,
      ),
    },
    now,
  );
  return { ok: true, message: 'Đã hủy lịch sạc và giải phóng khung giờ.', state: next };
}

/** processTimeoutReservations: quá thời gian giữ chỗ mà chưa check-in → EXPIRED (ghi nhận bỏ chỗ). */
export function processTimeoutReservations(state: ChargingState, now: number) {
  const holdMs = state.chargingConfig.holdMinutes * MINUTE;
  const expired: ChargingReservation[] = [];
  const reservations = state.chargingReservations.map((reservation) => {
    if (reservation.status === 'CONFIRMED' && now >= ms(reservation.startAt) + holdMs) {
      const updated = {
        ...reservation,
        status: 'EXPIRED' as const,
        expiredAt: iso(ms(reservation.startAt) + holdMs),
        note: 'Không check-in đúng giờ — hệ thống tự hủy và giải phóng cổng.',
      };
      expired.push(updated);
      return updated;
    }
    return reservation;
  });
  return { state: expired.length ? { ...state, chargingReservations: reservations } : state, expired };
}

/** Lịch đặt CONFIRMED gần nhất trên cổng bắt đầu sau thời điểm `from`. */
function nextReservationStart(state: ChargingState, portId: string, from: number, excludeId?: string) {
  const starts = state.chargingReservations
    .filter(
      (reservation) =>
        reservation.portId === portId &&
        reservation.id !== excludeId &&
        reservation.status === 'CONFIRMED' &&
        ms(reservation.startAt) > from,
    )
    .map((reservation) => ms(reservation.startAt));
  return starts.length ? Math.min(...starts) : null;
}

interface StartSessionInput {
  port: ChargingPort;
  vehicleKind: ChargeVehicleKind;
  vehicleId: string;
  vehicleLabel: string;
  vehicleType: PersonalVehicleType;
  ownerName: string;
  batteryCapacityKwh: number;
  startBattery: number;
  targetBattery: number;
  reservationId?: string;
  requestId?: string;
}

/** ChargingPoint.startCharging + ChargingSession.startSession. */
function buildSession(state: ChargingState, input: StartSessionInput, now: number): ChargingSession {
  const config = state.chargingConfig;
  const powerKw = Math.min(input.port.power, VEHICLE_PROFILES[input.vehicleType].maxPowerKw);
  const energy = (input.batteryCapacityKwh * Math.max(0, input.targetBattery - input.startBattery)) / 100;
  const expectedFullAt = now + (powerKw > 0 ? (energy / powerKw) * 60 * MINUTE : 0);
  const nextStart = nextReservationStart(state, input.port.id, now, input.reservationId);
  const maxEnd = now + config.maxSessionMinutes * MINUTE;
  const mustEndBy = Math.min(maxEnd, nextStart ?? Number.POSITIVE_INFINITY);
  return {
    id: makeId('ses'),
    hubId: input.port.hubId,
    portId: input.port.id,
    portCode: input.port.code,
    vehicleKind: input.vehicleKind,
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    ownerName: input.ownerName,
    reservationId: input.reservationId,
    requestId: input.requestId,
    batteryCapacityKwh: input.batteryCapacityKwh,
    powerKw,
    startBattery: input.startBattery,
    targetBattery: input.targetBattery,
    startedAt: iso(now),
    expectedFullAt: iso(expectedFullAt),
    mustEndBy: iso(mustEndBy),
    status: 'CHARGING',
  };
}

/** validateCheckIn: xác nhận mã đặt lịch tại cổng và bắt đầu phiên sạc. */
export function validateCheckIn(
  state: ChargingState,
  input: { code: string; studentId?: string },
  now: number,
): OpResult<{ session: ChargingSession }> {
  const code = input.code.trim().toUpperCase();
  const reservation = state.chargingReservations.find((item) => item.code === code);
  if (!reservation) return fail('Mã đặt lịch không tồn tại.');
  if (input.studentId && reservation.studentId !== input.studentId) {
    return fail('Mã đặt lịch không thuộc tài khoản của bạn.');
  }
  if (reservation.status === 'EXPIRED') return fail('Lịch sạc đã quá hạn giữ chỗ và bị hủy tự động.');
  if (reservation.status !== 'CONFIRMED') return fail('Lịch sạc này không còn hiệu lực để check-in.');
  const config = state.chargingConfig;
  const start = ms(reservation.startAt);
  if (now < start - config.earlyCheckInMinutes * MINUTE) {
    return fail(`Chưa đến giờ check-in. Bạn có thể check-in từ ${formatHm(start - config.earlyCheckInMinutes * MINUTE)}.`);
  }
  if (now >= start + config.holdMinutes * MINUTE) return fail('Đã quá thời gian giữ chỗ.');
  const port = state.chargingPorts.find((item) => item.id === reservation.portId);
  if (!port) return fail('Không tìm thấy cổng sạc.');
  if (port.underMaintenance) return fail(`Cổng ${port.code} đang bảo trì. Vui lòng liên hệ đơn vị vận hành.`);
  const busy = state.chargingSessions.find((session) => session.portId === port.id && isLiveSession(session));
  if (busy) {
    return fail(
      `Cổng ${port.code} vẫn đang được sử dụng, phiên trước sẽ kết thúc lúc ${formatHm(
        busy.mustEndBy ?? busy.expectedFullAt,
      )}.`,
    );
  }

  const vehicle = state.vehicles.find((item) => item.id === reservation.vehicleId);
  const vehicleType: PersonalVehicleType =
    reservation.vehicleKind === 'shared' ? (vehicle?.type ?? 'motorbike') : guessPersonalType(reservation);
  const session = buildSession(
    state,
    {
      port,
      vehicleKind: reservation.vehicleKind,
      vehicleId: reservation.vehicleId,
      vehicleLabel: reservation.vehicleLabel,
      vehicleType,
      ownerName: reservation.studentName,
      batteryCapacityKwh: reservation.batteryCapacityKwh,
      startBattery: reservation.currentBattery,
      targetBattery: reservation.targetBattery,
      reservationId: reservation.id,
    },
    now,
  );

  const next = syncChargingState(
    {
      ...state,
      chargingSessions: [session, ...state.chargingSessions],
      chargingReservations: state.chargingReservations.map((item) =>
        item.id === reservation.id
          ? { ...item, status: 'CHECKED_IN', checkedInAt: iso(now), sessionId: session.id }
          : item,
      ),
      vehicles: state.vehicles.map((item) =>
        item.id === reservation.vehicleId && item.status === 'available'
          ? { ...item, status: 'charging' }
          : item,
      ),
    },
    now,
  );
  return { ok: true, message: `Check-in thành công. Cổng ${port.code} bắt đầu cấp điện.`, state: next, session };
}

/** Xe cá nhân: suy ra loại xe từ dung lượng pin đã lưu trong lịch. */
function guessPersonalType(reservation: ChargingReservation): PersonalVehicleType {
  if (reservation.batteryCapacityKwh >= 10) return 'car';
  if (reservation.batteryCapacityKwh >= 2) return 'motorbike';
  return 'bike';
}

/* ------------------------------------------------------------------ */
/* 3. HOÀN TẤT PHIÊN SẠC                                               */
/* ------------------------------------------------------------------ */

/**
 * ChargingSession.stopSession + ChargingPoint.stopCharging + ChargingReservation.markCompleted.
 * Ghi nhận lượng điện tiêu thụ, chi phí; cập nhật pin xe; giải phóng cổng;
 * nếu bật tự động cấp điện thì chuyển cổng cho xe kế tiếp trong hàng đợi.
 */
export function completeChargingSession(
  state: ChargingState,
  sessionId: string,
  reason: ChargingEndReason,
  now: number,
): OpResult<{ session: ChargingSession; nextAllocated: number }> {
  const session = state.chargingSessions.find((item) => item.id === sessionId);
  if (!session) return fail('Không tìm thấy phiên sạc.');
  if (!isLiveSession(session)) return fail('Phiên sạc đã kết thúc trước đó.');

  const endBattery = sessionBatteryAt(session, now);
  const energyKwh = round2((session.batteryCapacityKwh * Math.max(0, endBattery - session.startBattery)) / 100);
  const cost = estimatePrice(energyKwh, state.chargingConfig, Boolean(session.reservationId));
  const finalReason: ChargingEndReason =
    reason === 'user_stop' && endBattery >= session.targetBattery ? 'full' : reason;
  const completed: ChargingSession = {
    ...session,
    status: 'COMPLETED',
    endedAt: iso(now),
    endBattery,
    energyKwh,
    cost,
    endReason: finalReason,
    fullAt: session.fullAt ?? (endBattery >= session.targetBattery ? session.expectedFullAt : undefined),
  };

  const config = state.chargingConfig;
  let requests = state.chargingRequests.map((request) =>
    request.id === session.requestId ? { ...request, status: 'completed' as const } : request,
  );
  // Xe dùng chung bị ngắt sớm mà vẫn dưới ngưỡng → đưa lại vào hàng đợi.
  const vehicle = state.vehicles.find((item) => item.id === session.vehicleId);
  if (
    session.vehicleKind === 'shared' &&
    !session.reservationId &&
    vehicle &&
    endBattery < config.lowBatteryThreshold &&
    (finalReason === 'preempted' || finalReason === 'port_fault' || finalReason === 'max_duration')
  ) {
    requests = [
      {
        id: makeId('req'),
        vehicleId: vehicle.id,
        hubId: session.hubId,
        priority: 0,
        status: 'queued',
        source: 'auto',
        batteryAtRequest: endBattery,
        targetBattery: session.targetBattery,
        requestedAt: iso(now),
        note: 'Phiên trước bị ngắt — tự xếp lại hàng đợi',
      },
      ...requests,
    ];
  }

  let next: ChargingState = {
    ...state,
    chargingSessions: state.chargingSessions.map((item) => (item.id === sessionId ? completed : item)),
    chargingReservations: state.chargingReservations.map((item) =>
      item.id === session.reservationId ? { ...item, status: 'COMPLETED', completedAt: iso(now) } : item,
    ),
    chargingRequests: requests,
    vehicles: state.vehicles.map((item) =>
      item.id === session.vehicleId && session.vehicleKind === 'shared'
        ? {
            ...item,
            battery: Math.round(endBattery),
            status: item.status === 'charging' ? 'available' : item.status,
          }
        : item,
    ),
  };

  let nextAllocated = 0;
  if (config.autoAllocate && finalReason !== 'port_fault') {
    // Chỉ chuyển cổng vừa được giải phóng cho xe ưu tiên cao nhất đang chờ.
    const allocation = allocateChargingPower(next, session.hubId, now, session.portId);
    next = allocation.state;
    nextAllocated = allocation.allocated.length;
  }
  next = syncChargingState(next, now);

  const reasonText: Record<ChargingEndReason, string> = {
    full: 'Đã sạc đầy và rút sạc',
    user_stop: 'Đã dừng sạc',
    operator_stop: 'Operator đã kết thúc phiên sạc',
    preempted: 'Phiên sạc kết thúc để nhường cổng cho lịch đặt kế tiếp',
    max_duration: 'Phiên sạc kết thúc do đạt thời lượng tối đa',
    port_fault: 'Phiên sạc bị ngắt do cổng chuyển sang bảo trì',
  };
  return {
    ok: true,
    message: `${reasonText[finalReason]}. Đã sạc ${energyKwh} kWh (${Math.round(session.startBattery)}% → ${Math.round(
      endBattery,
    )}%).`,
    state: next,
    session: completed,
    nextAllocated,
  };
}

/* ------------------------------------------------------------------ */
/* 2. LẬP LỊCH SẠC THÔNG MINH ƯU TIÊN                                  */
/* ------------------------------------------------------------------ */

export interface RankedRequest {
  request: ChargingRequest;
  vehicle?: Vehicle;
  battery: number;
  score: number;
  breakdown: PriorityBreakdown;
  waitedMinutes: number;
  minutesToNextUse: number | null;
  /** Xe đang ở Hub và rảnh để cắm sạc. */
  eligible: boolean;
  reason?: string;
}

const vehicleStatusReason: Partial<Record<Vehicle['status'], string>> = {
  reserved: 'Xe đang được sinh viên giữ chỗ',
  in_use: 'Xe đang được thuê',
  maintenance: 'Xe đang bảo trì',
  dispatching: 'Xe đang chờ điều phối',
  in_transit: 'Xe đang vận chuyển',
  charging: 'Xe đang sạc',
};

/** prioritizeVehicles: sắp xếp các yêu cầu đang chờ theo điểm ưu tiên giảm dần. */
export function prioritizeVehicles(state: ChargingState, hubId: string, now: number): RankedRequest[] {
  return state.chargingRequests
    .filter((request) => request.hubId === hubId && request.status === 'queued')
    .map((request) => {
      const vehicle = state.vehicles.find((item) => item.id === request.vehicleId);
      const battery = vehicle?.battery ?? request.batteryAtRequest;
      const waitedMinutes = Math.max(0, (now - ms(request.requestedAt)) / MINUTE);
      const minutesToNextUse = request.neededBy ? Math.max(0, (ms(request.neededBy) - now) / MINUTE) : null;
      const { score, breakdown } = calculatePriorityScore({
        battery,
        isShared: true,
        minutesToNextUse,
        waitedMinutes,
        config: state.chargingConfig,
      });
      let reason: string | undefined;
      if (!vehicle) reason = 'Không tìm thấy xe';
      else if (vehicle.hubId !== hubId) reason = 'Xe không còn ở Hub này';
      else if (vehicle.status !== 'available') reason = vehicleStatusReason[vehicle.status] ?? 'Xe không khả dụng';
      return { request, vehicle, battery, score, breakdown, waitedMinutes, minutesToNextUse, eligible: !reason, reason };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        ms(a.request.requestedAt) - ms(b.request.requestedAt),
    );
}

export interface FreePortNow {
  port: ChargingPort;
  /** Phải trả cổng trước thời điểm này (lịch đặt kế tiếp), null nếu không giới hạn. */
  windowEnd: number | null;
}

/** Các cổng có thể cấp điện ngay bây giờ (đủ ít nhất 1 khung giờ trước lịch đặt kế tiếp). */
export function getFreePortsNow(state: ChargingState, hubId: string, now: number): FreePortNow[] {
  const { slotMinutes, earlyCheckInMinutes, holdMinutes } = state.chargingConfig;
  return state.chargingPorts
    .filter((port) => port.hubId === hubId && !port.underMaintenance)
    .filter(
      (port) => !state.chargingSessions.some((session) => session.portId === port.id && isLiveSession(session)),
    )
    .filter(
      (port) =>
        !state.chargingReservations.some(
          (reservation) =>
            reservation.portId === port.id &&
            reservation.status === 'CONFIRMED' &&
            now >= ms(reservation.startAt) - earlyCheckInMinutes * MINUTE &&
            now < ms(reservation.startAt) + holdMinutes * MINUTE,
        ),
    )
    .map((port) => ({ port, windowEnd: nextReservationStart(state, port.id, now) }))
    .filter((item) => item.windowEnd === null || item.windowEnd - now >= slotMinutes * MINUTE)
    .sort(
      (a, b) =>
        (b.windowEnd ?? Number.POSITIVE_INFINITY) - (a.windowEnd ?? Number.POSITIVE_INFINITY) ||
        b.port.power - a.port.power,
    );
}

/** PriorityChargingQueue.getOverflowVehicles: các xe vượt quá khả năng phục vụ hiện tại. */
export const getOverflowVehicles = (queue: RankedRequest[], capacity: number) =>
  queue.filter((item) => item.eligible).slice(Math.max(0, capacity));

/** Thời gian chờ ước tính cho xe thứ `position` (0-based) trong danh sách tràn. */
export function estimateOverflowWaits(state: ChargingState, hubId: string, count: number, now: number) {
  const releases = state.chargingSessions
    .filter((session) => session.hubId === hubId && isLiveSession(session))
    .map((session) =>
      session.status === 'FULL'
        ? now
        : Math.min(ms(session.expectedFullAt), session.mustEndBy ? ms(session.mustEndBy) : Number.POSITIVE_INFINITY),
    )
    .sort((a, b) => a - b);
  return Array.from({ length: count }, (_, index) =>
    index < releases.length ? Math.max(0, Math.round((releases[index] - now) / MINUTE)) : null,
  );
}

/** allocateChargingPower: cấp điện cho các xe ưu tiên cao nhất theo số cổng đang trống. */
export function allocateChargingPower(state: ChargingState, hubId: string, now: number, onlyPortId?: string) {
  const ranked = prioritizeVehicles(state, hubId, now).filter((item) => item.eligible);
  const freePorts = getFreePortsNow(state, hubId, now).filter((item) => !onlyPortId || item.port.id === onlyPortId);
  const allocated: { request: ChargingRequest; session: ChargingSession }[] = [];
  let next = state;

  ranked.slice(0, freePorts.length).forEach((item, index) => {
    const { port } = freePorts[index];
    const vehicle = item.vehicle!;
    const profile = VEHICLE_PROFILES[vehicle.type];
    const target = Math.max(item.request.targetBattery, Math.min(100, vehicle.battery + 5));
    const session = buildSession(
      next,
      {
        port,
        vehicleKind: 'shared',
        vehicleId: vehicle.id,
        vehicleLabel: `${vehicle.code} · ${vehicle.model}`,
        vehicleType: vehicle.type,
        ownerName: 'Đội xe dùng chung',
        batteryCapacityKwh: profile.capacityKwh,
        startBattery: vehicle.battery,
        targetBattery: target,
        requestId: item.request.id,
      },
      now,
    );
    allocated.push({ request: item.request, session });
    next = {
      ...next,
      chargingSessions: [session, ...next.chargingSessions],
      chargingRequests: next.chargingRequests.map((request) =>
        request.id === item.request.id
          ? { ...request, status: 'charging', sessionId: session.id, scheduledAt: formatHm(now), priority: item.score }
          : request,
      ),
      vehicles: next.vehicles.map((entry) => (entry.id === vehicle.id ? { ...entry, status: 'charging' } : entry)),
    };
  });

  const overflow = ranked.slice(freePorts.length);
  if (overflow.length && !onlyPortId) {
    const waits = estimateOverflowWaits(next, hubId, overflow.length, now);
    next = {
      ...next,
      chargingRequests: next.chargingRequests.map((request) => {
        const position = overflow.findIndex((item) => item.request.id === request.id);
        if (position < 0) return request;
        const wait = waits[position];
        return {
          ...request,
          priority: overflow[position].score,
          scheduledAt: wait === null ? undefined : formatHm(now + wait * MINUTE),
        };
      }),
    };
  }

  return { state: syncChargingState(next, now), allocated, overflow };
}

/** Thêm một xe dùng chung vào hàng đợi sạc ưu tiên (addVehicleToQueue). */
export function requestCharging(
  state: ChargingState,
  input: {
    vehicleId: string;
    source: ChargingRequestSource;
    targetBattery?: number;
    neededBy?: string;
    note?: string;
  },
  now: number,
): OpResult<{ request: ChargingRequest }> {
  const vehicle = state.vehicles.find((item) => item.id === input.vehicleId);
  if (!vehicle) return fail('Không tìm thấy xe.');
  if (vehicle.status !== 'available') return fail(`Xe ${vehicle.code} không khả dụng để xếp lịch sạc.`);
  const target = input.targetBattery ?? state.chargingConfig.defaultTargetBattery;
  if (vehicle.battery >= target) return fail(`Xe ${vehicle.code} đã đạt ${vehicle.battery}% — không cần sạc.`);
  const duplicated = state.chargingRequests.some(
    (request) =>
      request.vehicleId === vehicle.id && (request.status === 'queued' || request.status === 'charging'),
  );
  if (duplicated) return fail(`Xe ${vehicle.code} đã có trong hàng đợi sạc.`);
  const request: ChargingRequest = {
    id: makeId('req'),
    vehicleId: vehicle.id,
    hubId: vehicle.hubId,
    priority: 0,
    status: 'queued',
    source: input.source,
    batteryAtRequest: vehicle.battery,
    targetBattery: target,
    requestedAt: iso(now),
    neededBy: input.neededBy,
    note: input.note,
  };
  const withRequest = { ...state, chargingRequests: [request, ...state.chargingRequests] };
  const ranked = prioritizeVehicles(withRequest, vehicle.hubId, now).find((item) => item.request.id === request.id);
  return {
    ok: true,
    message: `Đã thêm ${vehicle.code} vào hàng đợi sạc ưu tiên.`,
    state: {
      ...withRequest,
      chargingRequests: withRequest.chargingRequests.map((item) =>
        item.id === request.id ? { ...item, priority: ranked?.score ?? 0 } : item,
      ),
    },
    request,
  };
}

export function cancelChargingRequest(state: ChargingState, requestId: string): OpResult {
  const request = state.chargingRequests.find((item) => item.id === requestId);
  if (!request || request.status !== 'queued') return fail('Chỉ gỡ được xe đang chờ trong hàng đợi.');
  return {
    ok: true,
    message: 'Đã gỡ xe khỏi hàng đợi sạc.',
    state: {
      ...state,
      chargingRequests: state.chargingRequests.map((item) =>
        item.id === requestId ? { ...item, status: 'cancelled' } : item,
      ),
    },
  };
}

export interface SmartScheduleResult {
  added: number;
  allocated: { request: ChargingRequest; session: ChargingSession }[];
  overflow: RankedRequest[];
}

/**
 * createSmartChargingSchedule (Use case "Lập lịch sạc thông minh ưu tiên"):
 *  B3 — quét xe dùng chung tại Hub có pin dưới ngưỡng, đưa vào hàng đợi;
 *  B4 — sắp xếp ưu tiên và cấp điện cho các xe đứng đầu theo số cổng trống;
 *  Ext 1 — không có xe cần sạc → hủy yêu cầu, báo "không có xe cần sạc";
 *  Ext 2 — số xe nhiều hơn cổng trống → các xe dư ở lại hàng đợi (overflow).
 */
export function createSmartChargingSchedule(
  state: ChargingState,
  hubId: string,
  now: number,
): OpResult<SmartScheduleResult> {
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return fail('Không tìm thấy Hub.');
  const config = state.chargingConfig;
  let next = state;
  let added = 0;
  state.vehicles
    .filter(
      (vehicle) =>
        vehicle.hubId === hubId && vehicle.status === 'available' && vehicle.battery < config.lowBatteryThreshold,
    )
    .forEach((vehicle) => {
      const result = requestCharging(next, { vehicleId: vehicle.id, source: 'auto', note: 'Pin dưới ngưỡng' }, now);
      if (result.ok) {
        next = result.state;
        added += 1;
      }
    });

  const waiting = prioritizeVehicles(next, hubId, now).filter((item) => item.eligible);
  if (waiting.length === 0) {
    return fail('Không có phương tiện nào cần ưu tiên sạc tại Hub này — yêu cầu lập lịch bị hủy.');
  }
  const allocation = allocateChargingPower(next, hubId, now);
  const parts = [
    added ? `thêm ${added} xe pin thấp vào hàng đợi` : null,
    `cấp điện cho ${allocation.allocated.length} xe`,
    allocation.overflow.length ? `${allocation.overflow.length} xe vượt công suất phải chờ` : null,
  ].filter(Boolean);
  return {
    ok: true,
    message: `Đã lập lịch sạc ưu tiên: ${parts.join(', ')}.`,
    state: allocation.state,
    added,
    allocated: allocation.allocated,
    overflow: allocation.overflow,
  };
}

/** processQueueOverflow: thông tin chờ và Hub thay thế cho các xe tràn hàng đợi. */
export function processQueueOverflow(state: ChargingState, hubId: string, now: number) {
  const ranked = prioritizeVehicles(state, hubId, now);
  const overflow = getOverflowVehicles(ranked, getFreePortsNow(state, hubId, now).length);
  const waits = estimateOverflowWaits(state, hubId, overflow.length, now);
  const alternatives = state.hubs
    .filter((hub) => hub.id !== hubId && hub.status !== 'maintenance')
    .map((hub) => ({ hub, freePorts: getFreePortsNow(state, hub.id, now).length }))
    .filter((item) => item.freePorts > 0)
    .sort((a, b) => b.freePorts - a.freePorts);
  return {
    hasOverflow: overflow.length > 0,
    items: overflow.map((item, index) => ({ ...item, waitMinutes: waits[index] })),
    alternatives,
  };
}

/* ------------------------------------------------------------------ */
/* Bảo trì cổng                                                         */
/* ------------------------------------------------------------------ */

/**
 * Bật/tắt bảo trì cho cổng. Khi bật: ngắt phiên đang chạy, chuyển các lịch đặt
 * sắp tới sang cổng trống khác cùng Hub (nếu có), không thì hủy và ghi chú lý do.
 */
export function setPortMaintenance(
  state: ChargingState,
  portId: string,
  underMaintenance: boolean,
  now: number,
): OpResult<{ moved: number; cancelled: number }> {
  const port = state.chargingPorts.find((item) => item.id === portId);
  if (!port) return fail('Không tìm thấy cổng sạc.');
  let next: ChargingState = {
    ...state,
    chargingPorts: state.chargingPorts.map((item) => (item.id === portId ? { ...item, underMaintenance } : item)),
  };
  if (!underMaintenance) {
    return {
      ok: true,
      message: `Cổng ${port.code} đã hoạt động trở lại.`,
      state: syncChargingState(next, now),
      moved: 0,
      cancelled: 0,
    };
  }

  const live = next.chargingSessions.find((session) => session.portId === portId && isLiveSession(session));
  if (live) {
    const stopped = completeChargingSession(next, live.id, 'port_fault', now);
    if (stopped.ok) next = stopped.state;
  }

  let moved = 0;
  let cancelled = 0;
  const upcoming = next.chargingReservations.filter(
    (reservation) => reservation.portId === portId && reservation.status === 'CONFIRMED',
  );
  for (const reservation of upcoming) {
    const start = ms(reservation.startAt);
    const end = ms(reservation.endAt);
    const replacement = next.chargingPorts.find(
      (candidate) =>
        candidate.hubId === port.hubId &&
        candidate.id !== portId &&
        candidate.connector === port.connector &&
        getPortStateInWindow(next, candidate, start, end, now, reservation.id) === 'free',
    );
    next = {
      ...next,
      chargingReservations: next.chargingReservations.map((item) => {
        if (item.id !== reservation.id) return item;
        if (replacement) {
          moved += 1;
          return {
            ...item,
            portId: replacement.id,
            portCode: replacement.code,
            power: replacement.power,
            note: `Cổng ${port.code} bảo trì — hệ thống đã chuyển sang ${replacement.code}.`,
          };
        }
        cancelled += 1;
        return {
          ...item,
          status: 'CANCELLED',
          cancelledAt: iso(now),
          note: `Cổng ${port.code} bảo trì và không còn cổng thay thế — lịch bị hủy.`,
        };
      }),
    };
  }

  return {
    ok: true,
    message: `Cổng ${port.code} chuyển sang bảo trì${moved ? `, đã chuyển ${moved} lịch sang cổng khác` : ''}${
      cancelled ? `, hủy ${cancelled} lịch không có cổng thay thế` : ''
    }.`,
    state: syncChargingState(next, now),
    moved,
    cancelled,
  };
}

/* ------------------------------------------------------------------ */
/* Tick định kỳ                                                         */
/* ------------------------------------------------------------------ */

const fingerprint = (state: ChargingState) =>
  JSON.stringify([
    state.chargingPorts.map((port) => port.status),
    state.chargingSessions.map((session) => session.status),
    state.chargingReservations.map((reservation) => reservation.status),
    state.hubs.map((hub) => [hub.chargers, hub.activeCharging]),
  ]);

/**
 * Chạy định kỳ (mỗi vài giây): hủy lịch quá hạn check-in, ngắt các phiên phải
 * nhường cổng / quá thời lượng tối đa, đánh dấu phiên đã đầy, đồng bộ trạng thái cổng.
 */
export function runChargingTick(state: ChargingState, now: number) {
  const before = fingerprint(state);
  const events: string[] = [];
  const timeout = processTimeoutReservations(state, now);
  let next = timeout.state;
  timeout.expired.forEach((reservation) =>
    events.push(`Lịch sạc ${reservation.code} quá hạn check-in, cổng ${reservation.portCode} đã được giải phóng.`),
  );

  next.chargingSessions
    .filter((session) => isLiveSession(session) && session.mustEndBy && now >= ms(session.mustEndBy))
    .forEach((session) => {
      const deadline = ms(session.mustEndBy!);
      const reservationAtDeadline = next.chargingReservations.some(
        (reservation) =>
          reservation.portId === session.portId &&
          reservation.status === 'CONFIRMED' &&
          Math.abs(ms(reservation.startAt) - deadline) < MINUTE,
      );
      const result = completeChargingSession(
        next,
        session.id,
        reservationAtDeadline ? 'preempted' : 'max_duration',
        Math.min(now, deadline),
      );
      if (result.ok) {
        next = result.state;
        events.push(`${session.vehicleLabel} tại ${session.portCode}: ${result.message}`);
      }
    });

  next = syncChargingState(next, now);
  return { state: next, changed: fingerprint(next) !== before, events };
}

/** Lấy phần state sạc từ AppData. */
export const pickChargingState = (data: ChargingState): ChargingState => ({
  hubs: data.hubs,
  vehicles: data.vehicles,
  bookings: data.bookings,
  chargingPorts: data.chargingPorts,
  chargingReservations: data.chargingReservations,
  chargingSessions: data.chargingSessions,
  chargingRequests: data.chargingRequests,
  chargingConfig: data.chargingConfig,
});
