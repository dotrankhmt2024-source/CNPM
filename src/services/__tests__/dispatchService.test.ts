import { describe, expect, it } from 'vitest';
import { createInitialData } from '../../mocks/seed';
import {
  assignDispatchStaff,
  cancelDispatchOrder,
  checkDestinationCapacity,
  completeDispatchOrder,
  createDispatchOrder,
  destinationFreeSlots,
  pickDispatchState,
  startDispatchTransport,
  suggestRebalancing,
  transitProgress,
  type DispatchState,
} from '../dispatchService';
import { MINUTE, atLocalTime } from '../clock';

const NOW = atLocalTime('2026-11-20', '09:00');
const fresh = (): DispatchState => pickDispatchState(createInitialData(NOW));
const input = { operatorId: 'OP01', operatorName: 'Operator test' };
const hub = (state: DispatchState, id: string) => state.hubs.find((item) => item.id === id)!;
const vehicle = (state: DispatchState, id: string) => state.vehicles.find((item) => item.id === id)!;

describe('Test case 4.15 — Tạo và thực thi lệnh điều phối', () => {
  it('PENDING → ASSIGNED → IN_TRANSIT → COMPLETED, cập nhật xe và sức chứa hai Hub', () => {
    const initial = fresh();
    const sourceBefore = hub(initial, 'h1').occupiedParking;
    const destBefore = hub(initial, 'h2').occupiedParking;
    expect(checkDestinationCapacity(initial, 'h2', 2)).toBe(true);

    const created = createDispatchOrder(initial, { ...input, sourceHubId: 'h1', destHubId: 'h2', quantity: 2 }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { order } = created;
    expect(order.status).toBe('PENDING');
    expect(order.vehicleIds).toEqual(['v1', 'v2']); // xe pin cao nhất được chọn trước
    order.vehicleIds.forEach((id) => expect(vehicle(created.state, id).status).toBe('dispatching'));
    // Hub đích được giữ trước 2 chỗ
    expect(destinationFreeSlots(created.state, 'h2')).toBe(destinationFreeSlots(initial, 'h2') - 2);

    const assigned = assignDispatchStaff(created.state, order.id, 'st1', 'Operator test', NOW + MINUTE);
    if (!assigned.ok) throw new Error(assigned.message);
    expect(assigned.state.dispatchOrders.find((item) => item.id === order.id)?.status).toBe('ASSIGNED');

    const started = startDispatchTransport(assigned.state, order.id, 'NV Hùng', NOW + 2 * MINUTE);
    if (!started.ok) throw new Error(started.message);
    const inTransit = started.state.dispatchOrders.find((item) => item.id === order.id)!;
    expect(inTransit.status).toBe('IN_TRANSIT');
    expect(inTransit.expectedArrivalAt).toBeDefined();
    expect(hub(started.state, 'h1').occupiedParking).toBe(sourceBefore - 2);
    order.vehicleIds.forEach((id) => expect(vehicle(started.state, id).status).toBe('in_transit'));
    expect(transitProgress(inTransit, NOW + 2 * MINUTE).progress).toBe(0);

    const completed = completeDispatchOrder(started.state, order.id, 'NV Hùng', NOW + 20 * MINUTE);
    if (!completed.ok) throw new Error(completed.message);
    const done = completed.state.dispatchOrders.find((item) => item.id === order.id)!;
    expect(done.status).toBe('COMPLETED');
    expect(done.history.map((event) => event.status)).toEqual(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED']);
    expect(hub(completed.state, 'h2').occupiedParking).toBe(destBefore + 2);
    order.vehicleIds.forEach((id) => {
      expect(vehicle(completed.state, id).hubId).toBe('h2');
      expect(vehicle(completed.state, id).status).toBe('available');
    });
  });

  it('không cho vận chuyển khi chưa phân công nhân viên', () => {
    const created = createDispatchOrder(fresh(), { ...input, sourceHubId: 'h1', destHubId: 'h2', quantity: 1 }, NOW);
    if (!created.ok) throw new Error(created.message);
    const started = startDispatchTransport(created.state, created.order.id, 'x', NOW);
    expect(started.ok).toBe(false);
  });
});

describe('Test case 4.16 — Hub đích không đủ sức chứa', () => {
  it('HUB C2 còn 2 chỗ, điều 5 xe → không tạo lệnh, dữ liệu không đổi', () => {
    const base = fresh();
    const state: DispatchState = {
      ...base,
      hubs: base.hubs.map((item) => (item.id === 'h3' ? { ...item, occupiedParking: item.capacity - 2 } : item)),
      vehicles: [
        ...base.vehicles,
        ...['x1', 'x2', 'x3'].map((id) => ({ id, code: id, model: 'test', hubId: 'h1', battery: 90, status: 'available' as const, type: 'motorbike' as const })),
      ],
    };
    expect(checkDestinationCapacity(state, 'h3', 5)).toBe(false);
    const result = createDispatchOrder(state, { ...input, sourceHubId: 'h1', destHubId: 'h3', quantity: 5 }, NOW);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/không đủ sức chứa/);
  });

  it('chỗ đã giữ cho xe đang đến được tính vào sức chứa', () => {
    const base = fresh();
    const state: DispatchState = {
      ...base,
      hubs: base.hubs.map((item) => (item.id === 'h2' ? { ...item, occupiedParking: item.capacity - 2 } : item)),
    };
    const first = createDispatchOrder(state, { ...input, sourceHubId: 'h1', destHubId: 'h2', quantity: 2 }, NOW);
    if (!first.ok) throw new Error(first.message);
    const second = createDispatchOrder(first.state, { ...input, sourceHubId: 'h1', destHubId: 'h2', quantity: 1 }, NOW);
    expect(second.ok).toBe(false);
  });

  it('Hub nguồn không đủ xe khả dụng → từ chối', () => {
    const result = createDispatchOrder(fresh(), { ...input, sourceHubId: 'h4', destHubId: 'h1', quantity: 1 }, NOW);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/không đủ xe/);
  });
});

describe('Hủy lệnh điều phối', () => {
  it('hủy khi đã phân công → xe được mở khóa; không hủy được lệnh đang vận chuyển', () => {
    const created = createDispatchOrder(
      fresh(),
      { ...input, sourceHubId: 'h1', destHubId: 'h2', quantity: 1, staffId: 'st2' },
      NOW,
    );
    if (!created.ok) throw new Error(created.message);
    expect(created.order.status).toBe('ASSIGNED');
    const cancelled = cancelDispatchOrder(created.state, created.order.id, 'Đổi kế hoạch', 'Operator test', NOW);
    if (!cancelled.ok) throw new Error(cancelled.message);
    expect(vehicle(cancelled.state, created.order.vehicleIds[0]).status).toBe('available');
    expect(cancelled.state.dispatchOrders.find((item) => item.id === created.order.id)?.cancelReason).toBe('Đổi kế hoạch');

    const inTransit = fresh().dispatchOrders.find((order) => order.status === 'IN_TRANSIT')!;
    expect(cancelDispatchOrder(fresh(), inTransit.id, 'x', 'x', NOW).ok).toBe(false);
  });
});

describe('Gợi ý cân bằng xe', () => {
  it('đề xuất chuyển xe tới Hub thiếu xe từ Hub dư xe', () => {
    const suggestions = suggestRebalancing(fresh());
    suggestions.forEach((item) => {
      expect(item.from.id).not.toBe(item.to.id);
      expect(item.quantity).toBeGreaterThan(0);
    });
  });
});
