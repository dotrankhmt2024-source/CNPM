import { describe, expect, it } from 'vitest';
import { createInitialData } from '../../mocks/seed';
import {
  allocateChargingPower,
  calculatePriorityScore,
  completeChargingSession,
  createChargingReservation,
  createSmartChargingSchedule,
  getFreePortsNow,
  getOverflowVehicles,
  pickChargingState,
  prioritizeVehicles,
  processQueueOverflow,
  requestCharging,
  runChargingTick,
  setPortMaintenance,
  validateCheckIn,
  type ChargingState,
  type ReservationInput,
} from '../chargingScheduler';
import { MINUTE, atLocalTime } from '../clock';

/** Mốc thời gian cố định: 20/11/2026 09:00 (giờ địa phương). */
const NOW = atLocalTime('2026-11-20', '09:00');
const fresh = (): ChargingState => pickChargingState(createInitialData(NOW));

const reservationInput = (overrides: Partial<ReservationInput> = {}): ReservationInput => ({
  studentId: 'SV004',
  studentName: 'Sinh viên test',
  hubId: 'h3',
  portId: 'h3-port-3',
  vehicleKind: 'shared',
  vehicleId: 'v8',
  vehicleLabel: 'EV-041',
  vehicleType: 'motorbike',
  batteryCapacityKwh: 3.5,
  currentBattery: 18,
  targetBattery: 85,
  dateKey: '2026-11-20',
  startTime: '10:00',
  ...overrides,
});

describe('calculatePriorityScore', () => {
  const config = { criticalBatteryThreshold: 10, timeWindowMinutes: 60 };
  it('pin càng thấp điểm càng cao, pin nguy cấp được cộng thêm', () => {
    const low = calculatePriorityScore({ battery: 8, isShared: true, minutesToNextUse: null, waitedMinutes: 0, config });
    const mid = calculatePriorityScore({ battery: 15, isShared: true, minutesToNextUse: null, waitedMinutes: 0, config });
    const high = calculatePriorityScore({ battery: 40, isShared: true, minutesToNextUse: null, waitedMinutes: 0, config });
    expect(low.score).toBeGreaterThan(mid.score);
    expect(mid.score).toBeGreaterThan(high.score);
    expect(low.breakdown.critical).toBe(15);
    expect(mid.breakdown.critical).toBe(0);
  });

  it('xe sắp có chuyến đi được ưu tiên hơn, càng gần càng cao', () => {
    const base = { battery: 50, isShared: true, waitedMinutes: 0, config };
    const none = calculatePriorityScore({ ...base, minutesToNextUse: null }).score;
    const soon = calculatePriorityScore({ ...base, minutesToNextUse: 10 }).score;
    const later = calculatePriorityScore({ ...base, minutesToNextUse: 50 }).score;
    const outside = calculatePriorityScore({ ...base, minutesToNextUse: 120 }).score;
    expect(soon).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(none);
    expect(outside).toBe(none);
  });

  it('chờ lâu được cộng điểm nhưng có giới hạn (chống đói)', () => {
    const base = { battery: 50, isShared: false, minutesToNextUse: null, config };
    expect(calculatePriorityScore({ ...base, waitedMinutes: 30 }).breakdown.waiting).toBe(5);
    expect(calculatePriorityScore({ ...base, waitedMinutes: 600 }).breakdown.waiting).toBe(10);
  });
});

describe('Test case 4.13 — Ưu tiên xe pin thấp và cấp điện (HUB C2)', () => {
  it('HUB C2 có 3 cổng trống, 5 xe pin 8/15/40/60/75%: cấp điện 3 xe pin thấp nhất', () => {
    const state = fresh();
    expect(getFreePortsNow(state, 'h3', NOW)).toHaveLength(3);

    const result = createSmartChargingSchedule(state, 'h3', NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toBe(2); // 8% và 15% dưới ngưỡng 20% được tự thêm
    const allocatedBatteries = result.allocated.map((item) => item.session.startBattery);
    expect(allocatedBatteries).toEqual([8, 15, 40]);

    const next = result.state;
    result.allocated.forEach(({ session }) => {
      expect(session.status).toBe('CHARGING');
      expect(next.chargingPorts.find((port) => port.id === session.portId)?.status).toBe('used');
      expect(next.vehicles.find((vehicle) => vehicle.id === session.vehicleId)?.status).toBe('charging');
    });
    expect(next.hubs.find((hub) => hub.id === 'h3')?.activeCharging).toBe(4);
  });
});

describe('Test case 4.14 — Số xe chờ vượt số cổng sạc', () => {
  it('getOverflowVehicles(3) trả đúng 2 xe (60%, 75%) và không xe nào bị mất', () => {
    const scheduled = createSmartChargingSchedule(fresh(), 'h3', NOW);
    expect(scheduled.ok).toBe(true);
    if (!scheduled.ok) return;
    expect(scheduled.overflow.map((item) => item.battery)).toEqual([60, 75]);

    // Trước khi cấp điện: hàng đợi 5 xe, công suất 3 cổng → tràn 2 xe
    const withQueue = (() => {
      let state = fresh();
      for (const id of ['v11', 'v12']) {
        const added = requestCharging(state, { vehicleId: id, source: 'auto' }, NOW);
        if (added.ok) state = added.state;
      }
      return state;
    })();
    const ranked = prioritizeVehicles(withQueue, 'h3', NOW);
    expect(ranked.filter((item) => item.eligible)).toHaveLength(5);
    expect(getOverflowVehicles(ranked, 3).map((item) => item.battery)).toEqual([60, 75]);

    const overflow = processQueueOverflow(scheduled.state, 'h3', NOW);
    expect(overflow.hasOverflow).toBe(true);
    expect(overflow.items).toHaveLength(2);
    // Hai xe vẫn ở trạng thái chờ, không bị cấp điện vượt số cổng
    const queued = scheduled.state.chargingRequests.filter((item) => item.hubId === 'h3' && item.status === 'queued');
    expect(queued.map((item) => item.vehicleId).sort()).toEqual(['v14', 'v15']);
    expect(scheduled.state.chargingSessions.filter((item) => item.hubId === 'h3' && item.status === 'CHARGING')).toHaveLength(4);
  });

  it('khi một phiên hoàn tất, xe ưu tiên kế tiếp tự động được cấp điện', () => {
    const scheduled = createSmartChargingSchedule(fresh(), 'h3', NOW);
    if (!scheduled.ok) throw new Error(scheduled.message);
    const first = scheduled.allocated[0].session;
    const done = completeChargingSession(scheduled.state, first.id, 'operator_stop', NOW + 20 * MINUTE);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.nextAllocated).toBe(1);
    const nextSession = done.state.chargingSessions.find((item) => item.portId === first.portId && item.status === 'CHARGING');
    expect(nextSession?.vehicleId).toBe('v14'); // 60% là xe kế tiếp
  });
});

describe('Lập lịch ưu tiên — Extension 1', () => {
  it('Hub không có xe cần sạc → yêu cầu lập lịch bị hủy', () => {
    const result = createSmartChargingSchedule(fresh(), 'h4', NOW);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Không có phương tiện/);
  });
});

describe('Test case 4.7 — Đặt lịch sạc theo khung giờ', () => {
  it('đặt lịch xe pin thấp: CONFIRMED, điểm ưu tiên cao, khung giờ bị khóa', () => {
    const result = createChargingReservation(fresh(), reservationInput(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.status).toBe('CONFIRMED');
    expect(result.reservation.priorityScore).toBeGreaterThan(55);
    expect(result.reservation.code).toMatch(/^SAC\d{6}$/);
    expect(result.reservation.durationMinutes % 30).toBe(0);

    // Cùng cổng, khung giờ trùng → bị từ chối
    const clash = createChargingReservation(
      result.state,
      reservationInput({ vehicleId: 'pv-x', vehicleKind: 'personal', startTime: '10:30' }),
      NOW,
    );
    expect(clash.ok).toBe(false);
    expect(clash.message).toMatch(/Khung giờ đã đầy/);

    // Cùng xe, cổng khác nhưng trùng giờ → bị từ chối
    const sameVehicle = createChargingReservation(result.state, reservationInput({ portId: 'h3-port-2' }), NOW);
    expect(sameVehicle.ok).toBe(false);

    // Khung giờ sau khi lịch trước kết thúc → hợp lệ
    const after = createChargingReservation(
      result.state,
      reservationInput({ vehicleId: 'pv-x', vehicleKind: 'personal', startTime: '12:00' }),
      NOW,
    );
    expect(after.ok).toBe(true);
  });

  it('Test case 4.8 — chọn cổng đang bảo trì bị từ chối', () => {
    const maintenance = setPortMaintenance(fresh(), 'h3-port-3', true, NOW);
    if (!maintenance.ok) throw new Error(maintenance.message);
    const result = createChargingReservation(maintenance.state, reservationInput(), NOW);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/bảo trì/);
  });

  it('từ chối khung giờ đã qua, mức pin sai và đầu nối không tương thích', () => {
    expect(createChargingReservation(fresh(), reservationInput({ startTime: '08:00' }), NOW).ok).toBe(false);
    expect(createChargingReservation(fresh(), reservationInput({ currentBattery: 90, targetBattery: 80 }), NOW).ok).toBe(false);
    // Cổng DC chỉ dành cho ô tô
    expect(createChargingReservation(fresh(), reservationInput({ hubId: 'h1', portId: 'h1-port-8' }), NOW).ok).toBe(false);
  });
});

describe('Check-in, quá hạn giữ chỗ và hoàn tất phiên sạc', () => {
  const booked = () => {
    const result = createChargingReservation(fresh(), reservationInput({ startTime: '09:30' }), NOW);
    if (!result.ok) throw new Error(result.message);
    return result;
  };

  it('chưa đến giờ check-in thì bị từ chối', () => {
    const { state, reservation } = booked();
    const early = validateCheckIn(state, { code: reservation.code }, NOW);
    expect(early.ok).toBe(false);
    expect(early.message).toMatch(/Chưa đến giờ/);
  });

  it('check-in đúng giờ → phiên sạc bắt đầu; hoàn tất ghi nhận điện năng và chi phí', () => {
    const { state, reservation } = booked();
    const checkInAt = atLocalTime('2026-11-20', '09:25');
    const checkedIn = validateCheckIn(state, { code: reservation.code }, checkInAt);
    expect(checkedIn.ok).toBe(true);
    if (!checkedIn.ok) return;
    expect(checkedIn.state.chargingReservations.find((item) => item.id === reservation.id)?.status).toBe('CHECKED_IN');
    expect(checkedIn.state.chargingPorts.find((port) => port.id === reservation.portId)?.status).toBe('used');

    const fullAt = Date.parse(checkedIn.session.expectedFullAt);
    const ticked = runChargingTick(checkedIn.state, fullAt + MINUTE);
    expect(ticked.state.chargingSessions.find((item) => item.id === checkedIn.session.id)?.status).toBe('FULL');
    expect(ticked.state.chargingPorts.find((port) => port.id === reservation.portId)?.status).toBe('full');

    const done = completeChargingSession(ticked.state, checkedIn.session.id, 'user_stop', fullAt + 2 * MINUTE);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.session.endReason).toBe('full');
    expect(done.session.endBattery).toBe(85);
    expect(done.session.energyKwh).toBeCloseTo((3.5 * (85 - 18)) / 100, 2);
    expect(done.session.cost).toBeGreaterThan(0);
    expect(done.state.chargingReservations.find((item) => item.id === reservation.id)?.status).toBe('COMPLETED');
    // Cổng được giải phóng và (do bật tự động cấp điện) chuyển ngay cho xe đang chờ của HUB C2
    const nextOnPort = done.state.chargingSessions.find(
      (item) => item.portId === reservation.portId && item.status === 'CHARGING',
    );
    expect(nextOnPort?.id).not.toBe(checkedIn.session.id);
    expect(nextOnPort?.requestId).toBeDefined();
    expect(done.nextAllocated).toBe(1);
  });

  it('khi tắt tự động cấp điện, cổng trở về trạng thái trống sau khi hoàn tất', () => {
    const base = booked();
    const state = { ...base.state, chargingConfig: { ...base.state.chargingConfig, autoAllocate: false } };
    const checkedIn = validateCheckIn(state, { code: base.reservation.code }, atLocalTime('2026-11-20', '09:30'));
    if (!checkedIn.ok) throw new Error(checkedIn.message);
    const done = completeChargingSession(checkedIn.state, checkedIn.session.id, 'user_stop', atLocalTime('2026-11-20', '09:50'));
    if (!done.ok) throw new Error(done.message);
    expect(done.state.chargingPorts.find((port) => port.id === base.reservation.portId)?.status).toBe('free');
  });

  it('dừng sạc sớm chỉ tính lượng điện đã sạc', () => {
    const { state, reservation } = booked();
    const start = atLocalTime('2026-11-20', '09:30');
    const checkedIn = validateCheckIn(state, { code: reservation.code }, start);
    if (!checkedIn.ok) throw new Error(checkedIn.message);
    const halfway = start + (Date.parse(checkedIn.session.expectedFullAt) - start) / 2;
    const done = completeChargingSession(checkedIn.state, checkedIn.session.id, 'user_stop', halfway);
    if (!done.ok) throw new Error(done.message);
    expect(done.session.endReason).toBe('user_stop');
    expect(done.session.endBattery).toBeCloseTo((18 + 85) / 2, 0);
  });

  it('không check-in trong thời gian giữ chỗ → EXPIRED và giải phóng cổng', () => {
    const { state, reservation } = booked();
    const ticked = runChargingTick(state, atLocalTime('2026-11-20', '09:41'));
    expect(ticked.changed).toBe(true);
    expect(ticked.state.chargingReservations.find((item) => item.id === reservation.id)?.status).toBe('EXPIRED');
    expect(validateCheckIn(ticked.state, { code: reservation.code }, atLocalTime('2026-11-20', '09:42')).ok).toBe(false);
  });
});

describe('Phối hợp lịch đặt và hàng đợi ưu tiên', () => {
  it('xe trong hàng đợi phải nhường cổng khi tới giờ lịch đặt kế tiếp', () => {
    let state = fresh();
    // Đặt lịch lúc 10:00 trên mọi cổng AC trống của HUB D7 trừ 1 cổng
    const booked = createChargingReservation(
      state,
      reservationInput({ hubId: 'h4', portId: 'h4-port-1', vehicleKind: 'personal', vehicleId: 'pv-a', startTime: '10:00' }),
      NOW,
    );
    if (!booked.ok) throw new Error(booked.message);
    state = booked.state;
    for (const portId of ['h4-port-2', 'h4-port-3', 'h4-port-4']) {
      const maintenance = setPortMaintenance(state, portId, true, NOW);
      if (maintenance.ok) state = maintenance.state;
    }
    // Xe pin thấp tại D7
    state = { ...state, vehicles: state.vehicles.map((v) => (v.id === 'v10' ? { ...v, status: 'available', battery: 5 } : v)) };
    const queued = requestCharging(state, { vehicleId: 'v10', source: 'operator', targetBattery: 100 }, NOW);
    if (!queued.ok) throw new Error(queued.message);
    const allocation = allocateChargingPower(queued.state, 'h4', NOW);
    expect(allocation.allocated).toHaveLength(1);
    const session = allocation.allocated[0].session;
    expect(session.mustEndBy).toBe(new Date(atLocalTime('2026-11-20', '10:00')).toISOString());

    const ticked = runChargingTick(allocation.state, atLocalTime('2026-11-20', '10:00'));
    const ended = ticked.state.chargingSessions.find((item) => item.id === session.id);
    expect(ended?.status).toBe('COMPLETED');
    expect(ended?.endReason).toBe('preempted');
  });

  it('cổng chuyển bảo trì: lịch đặt sắp tới được chuyển sang cổng khác cùng loại', () => {
    const booked = createChargingReservation(fresh(), reservationInput(), NOW);
    if (!booked.ok) throw new Error(booked.message);
    const result = setPortMaintenance(booked.state, 'h3-port-3', true, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moved).toBe(1);
    const moved = result.state.chargingReservations.find((item) => item.id === booked.reservation.id);
    expect(moved?.status).toBe('CONFIRMED');
    expect(moved?.portId).not.toBe('h3-port-3');
  });
});
