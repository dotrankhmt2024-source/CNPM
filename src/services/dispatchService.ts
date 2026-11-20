/**
 * DispatchService — logic nghiệp vụ thuần của phân hệ điều phối xe giữa các Hub
 * (VehicleDispatchController + DispatchOrder trong Class diagram mục 3.6).
 *
 * Vòng đời lệnh (state-chart 4.4):
 *   PENDING (Khởi tạo) --assignStaff--> ASSIGNED (Đã phân công)
 *   ASSIGNED --startTransport--> IN_TRANSIT (Đang vận chuyển)
 *   IN_TRANSIT --confirmDelivery--> COMPLETED (Đã hoàn thành)
 *   PENDING | ASSIGNED --cancelOrder--> CANCELLED (Đã hủy)
 *
 * Ảnh hưởng tới xe / Hub:
 *   - Khi tạo lệnh: xe được khóa (status 'dispatching'); Hub đích được giữ trước số chỗ.
 *   - Khi bắt đầu vận chuyển: xe rời Hub nguồn ('in_transit'), Hub nguồn trống thêm chỗ.
 *   - Khi hoàn thành: xe nhập Hub đích ('available'), Hub đích bị chiếm thêm chỗ.
 *   - Khi hủy: xe được mở khóa, trả về 'available' tại Hub nguồn.
 */
import type { AppData, DispatchEvent, DispatchOrder, DispatchStatus, Hub, Vehicle } from '../types/domain';
import { MINUTE } from './clock';

export type DispatchState = Pick<AppData, 'hubs' | 'vehicles' | 'dispatchOrders' | 'dispatchStaff' | 'chargingRequests'>;

export type DispatchResult<T = unknown> =
  | ({ ok: true; message: string; state: DispatchState } & T)
  | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const iso = (time: number) => new Date(time).toISOString();

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  PENDING: 'Khởi tạo',
  ASSIGNED: 'Đã phân công',
  IN_TRANSIT: 'Đang vận chuyển',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};

export const ACTIVE_DISPATCH: DispatchStatus[] = ['PENDING', 'ASSIGNED', 'IN_TRANSIT'];

/** Tọa độ tương đối (km) của các Hub trong khu đô thị — dùng để ước tính quãng đường. */
const HUB_POSITION_KM: Record<string, [number, number]> = {
  h1: [0, 0],
  h2: [0.9, 0.5],
  h3: [2.3, 1.4],
  h4: [1.5, 2.6],
};

/** Tốc độ trung bình của xe tải nhỏ chở xe điện trong khu đô thị (km/h). */
const TRUCK_SPEED_KMH = 18;

export function hubDistanceKm(fromHubId: string, toHubId: string) {
  const from = HUB_POSITION_KM[fromHubId];
  const to = HUB_POSITION_KM[toHubId];
  if (!from || !to) return 2;
  return Math.round(Math.hypot(from[0] - to[0], from[1] - to[1]) * 10) / 10;
}

/** Thời gian vận chuyển ước tính: di chuyển + bốc/dỡ (≈2 phút mỗi 3 xe, tối thiểu 5 phút). */
export function estimateEtaMinutes(distanceKm: number, quantity: number) {
  const travel = (distanceKm / TRUCK_SPEED_KMH) * 60;
  const handling = Math.max(5, Math.ceil(quantity / 3) * 2);
  return Math.ceil(travel + handling);
}

/** Số chỗ Hub đích đã được giữ cho các lệnh chưa hoàn thành. */
export const inboundReserved = (orders: DispatchOrder[], hubId: string) =>
  orders
    .filter((order) => order.destHubId === hubId && ACTIVE_DISPATCH.includes(order.status))
    .reduce((sum, order) => sum + order.quantity, 0);

/** Số xe đang trên đường rời khỏi / tới Hub. */
export const vehiclesInTransit = (orders: DispatchOrder[], hubId: string, direction: 'in' | 'out') =>
  orders
    .filter(
      (order) =>
        order.status === 'IN_TRANSIT' && (direction === 'in' ? order.destHubId : order.sourceHubId) === hubId,
    )
    .reduce((sum, order) => sum + order.quantity, 0);

/** Chỗ trống thực sự còn nhận được tại Hub (đã trừ chỗ giữ cho xe đang đến). */
export function destinationFreeSlots(state: Pick<DispatchState, 'hubs' | 'dispatchOrders'>, hubId: string) {
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return 0;
  return Math.max(0, hub.capacity - hub.occupiedParking - inboundReserved(state.dispatchOrders, hubId));
}

/** MobilityHub.hasSufficientCapacity / VehicleDispatchController.checkDestinationCapacity. */
export const checkDestinationCapacity = (
  state: Pick<DispatchState, 'hubs' | 'dispatchOrders'>,
  hubId: string,
  quantity: number,
) => destinationFreeSlots(state, hubId) >= quantity;

/** Xe có thể điều phối tại Hub nguồn — ưu tiên xe pin cao để phục vụ ngay khi tới nơi. */
export const dispatchableVehicles = (state: Pick<DispatchState, 'vehicles'>, hubId: string): Vehicle[] =>
  state.vehicles
    .filter((vehicle) => vehicle.hubId === hubId && vehicle.status === 'available')
    .sort((a, b) => b.battery - a.battery);

/** Cảnh báo khi sau điều phối Hub đích còn dưới 15% chỗ trống (showCapacityWarning). */
export function capacityWarning(state: Pick<DispatchState, 'hubs' | 'dispatchOrders'>, hubId: string, quantity: number) {
  const hub = state.hubs.find((item) => item.id === hubId);
  if (!hub) return null;
  const remaining = destinationFreeSlots(state, hubId) - quantity;
  if (remaining < 0) return `Hub đích không đủ sức chứa (chỉ còn ${destinationFreeSlots(state, hubId)} chỗ).`;
  if (remaining < Math.ceil(hub.capacity * 0.15)) {
    return `Sau điều phối, ${hub.name} chỉ còn ${remaining}/${hub.capacity} chỗ trống — sắp hết chỗ.`;
  }
  return null;
}

let counter = 0;
const nextOrderCode = (orders: DispatchOrder[]) => {
  const max = orders.reduce((top, order) => Math.max(top, Number(order.code.replace(/\D/g, '')) || 0), 0);
  return `DP-${String(max + 1).padStart(4, '0')}`;
};
const makeOrderId = () => `dp-${Date.now().toString(36)}${(counter++).toString(36)}`;

const pushEvent = (order: DispatchOrder, event: DispatchEvent): DispatchOrder => ({
  ...order,
  history: [...order.history, event],
});

export interface CreateDispatchInput {
  operatorId: string;
  operatorName: string;
  sourceHubId: string;
  destHubId: string;
  quantity: number;
  /** Chọn xe cụ thể; bỏ trống thì hệ thống chọn xe pin cao nhất. */
  vehicleIds?: string[];
  staffId?: string;
  note?: string;
}

/** createDispatchOrder: kiểm tra Hub, số lượng, xe khả dụng, sức chứa Hub đích → tạo lệnh PENDING. */
export function createDispatchOrder(
  state: DispatchState,
  input: CreateDispatchInput,
  now: number,
): DispatchResult<{ order: DispatchOrder; warning: string | null }> {
  const source = state.hubs.find((hub) => hub.id === input.sourceHubId);
  const dest = state.hubs.find((hub) => hub.id === input.destHubId);
  if (!source || !dest) return fail('Không tìm thấy Hub nguồn hoặc Hub đích.');
  if (source.id === dest.id) return fail('Hub cần xe và Hub cung cấp xe phải khác nhau.');
  if (dest.status === 'maintenance') return fail(`${dest.name} đang tạm ngưng, không thể nhận xe.`);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail('Số lượng xe phải là số nguyên dương.');
  }

  const candidates = dispatchableVehicles(state, source.id);
  let chosen: Vehicle[];
  if (input.vehicleIds && input.vehicleIds.length > 0) {
    if (input.vehicleIds.length !== input.quantity) {
      return fail(`Đã chọn ${input.vehicleIds.length} xe nhưng số lượng là ${input.quantity}.`);
    }
    chosen = input.vehicleIds
      .map((id) => candidates.find((vehicle) => vehicle.id === id))
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
    if (chosen.length !== input.vehicleIds.length) {
      return fail('Một số xe đã chọn không còn khả dụng tại Hub cung cấp.');
    }
  } else {
    if (input.quantity > candidates.length) {
      return fail(`Hub cung cấp xe không đủ xe (chỉ còn ${candidates.length} xe khả dụng).`);
    }
    chosen = candidates.slice(0, input.quantity);
  }

  if (!checkDestinationCapacity(state, dest.id, input.quantity)) {
    return fail(
      `Hub cần xe không đủ sức chứa (chỉ còn ${destinationFreeSlots(state, dest.id)} chỗ sau khi trừ xe đang đến).`,
    );
  }

  const staff = input.staffId ? state.dispatchStaff.find((item) => item.id === input.staffId) : undefined;
  const distanceKm = hubDistanceKm(source.id, dest.id);
  let order: DispatchOrder = {
    id: makeOrderId(),
    code: nextOrderCode(state.dispatchOrders),
    operatorId: input.operatorId,
    operatorName: input.operatorName,
    sourceHubId: source.id,
    destHubId: dest.id,
    quantity: input.quantity,
    vehicleIds: chosen.map((vehicle) => vehicle.id),
    vehicleCodes: chosen.map((vehicle) => vehicle.code),
    status: 'PENDING',
    note: input.note?.trim() || undefined,
    etaMinutes: estimateEtaMinutes(distanceKm, input.quantity),
    distanceKm,
    createdAt: iso(now),
    history: [{ at: iso(now), status: 'PENDING', actor: input.operatorName, note: 'Tạo lệnh điều phối' }],
  };
  if (staff) {
    order = pushEvent(
      { ...order, status: 'ASSIGNED', staffId: staff.id, staffName: staff.name, assignedAt: iso(now) },
      { at: iso(now), status: 'ASSIGNED', actor: input.operatorName, note: `Phân công ${staff.name}` },
    );
  }

  const warning = capacityWarning(state, dest.id, input.quantity);
  const ids = new Set(order.vehicleIds);
  return {
    ok: true,
    message: `Đã tạo lệnh ${order.code}: ${order.quantity} xe từ ${source.name} tới ${dest.name}.`,
    order,
    warning,
    state: {
      ...state,
      dispatchOrders: [order, ...state.dispatchOrders],
      vehicles: state.vehicles.map((vehicle) =>
        ids.has(vehicle.id) ? { ...vehicle, status: 'dispatching' } : vehicle,
      ),
      // Xe đã được khóa để điều phối thì rút khỏi hàng đợi sạc đang chờ.
      chargingRequests: state.chargingRequests.map((request) =>
        ids.has(request.vehicleId) && request.status === 'queued'
          ? { ...request, status: 'cancelled', note: `Rút khỏi hàng đợi do điều phối (${order.code})` }
          : request,
      ),
    },
  };
}

const findOrder = (state: DispatchState, orderId: string) =>
  state.dispatchOrders.find((order) => order.id === orderId);

const replaceOrder = (state: DispatchState, order: DispatchOrder): DispatchState => ({
  ...state,
  dispatchOrders: state.dispatchOrders.map((item) => (item.id === order.id ? order : item)),
});

/** assignOperator(operatorID): phân công nhân viên vận chuyển. */
export function assignDispatchStaff(
  state: DispatchState,
  orderId: string,
  staffId: string,
  actor: string,
  now: number,
): DispatchResult {
  const order = findOrder(state, orderId);
  if (!order) return fail('Không tìm thấy lệnh điều phối.');
  if (order.status !== 'PENDING' && order.status !== 'ASSIGNED') {
    return fail('Chỉ phân công được lệnh chưa bắt đầu vận chuyển.');
  }
  const staff = state.dispatchStaff.find((item) => item.id === staffId);
  if (!staff) return fail('Không tìm thấy nhân viên.');
  const updated = pushEvent(
    { ...order, status: 'ASSIGNED', staffId: staff.id, staffName: staff.name, assignedAt: iso(now) },
    {
      at: iso(now),
      status: 'ASSIGNED',
      actor,
      note: order.staffId ? `Đổi phân công sang ${staff.name}` : `Phân công ${staff.name}`,
    },
  );
  return { ok: true, message: `Đã phân công ${staff.name} cho lệnh ${order.code}.`, state: replaceOrder(state, updated) };
}

/** executeDispatchOrder / startTransport: xe rời Hub nguồn, lệnh sang IN_TRANSIT. */
export function startDispatchTransport(
  state: DispatchState,
  orderId: string,
  actor: string,
  now: number,
): DispatchResult {
  const order = findOrder(state, orderId);
  if (!order) return fail('Không tìm thấy lệnh điều phối.');
  if (order.status !== 'ASSIGNED') {
    return fail(order.status === 'PENDING' ? 'Cần phân công nhân viên trước khi vận chuyển.' : 'Lệnh không ở trạng thái chờ vận chuyển.');
  }
  const ids = new Set(order.vehicleIds);
  const expectedArrivalAt = iso(now + order.etaMinutes * MINUTE);
  const updated = pushEvent(
    { ...order, status: 'IN_TRANSIT', startedAt: iso(now), expectedArrivalAt },
    { at: iso(now), status: 'IN_TRANSIT', actor, note: `Xuất phát, dự kiến tới lúc ${new Date(expectedArrivalAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` },
  );
  return {
    ok: true,
    message: `Lệnh ${order.code} bắt đầu vận chuyển ${order.quantity} xe.`,
    state: {
      ...replaceOrder(state, updated),
      vehicles: state.vehicles.map((vehicle) => (ids.has(vehicle.id) ? { ...vehicle, status: 'in_transit' } : vehicle)),
      hubs: state.hubs.map((hub) =>
        hub.id === order.sourceHubId
          ? { ...hub, occupiedParking: Math.max(0, hub.occupiedParking - order.quantity) }
          : hub,
      ),
    },
  };
}

/** completeDispatchOrder / confirmDeliveryAtTargetHub: xe nhập Hub đích. */
export function completeDispatchOrder(
  state: DispatchState,
  orderId: string,
  actor: string,
  now: number,
): DispatchResult {
  const order = findOrder(state, orderId);
  if (!order) return fail('Không tìm thấy lệnh điều phối.');
  if (order.status !== 'IN_TRANSIT') return fail('Chỉ xác nhận giao được lệnh đang vận chuyển.');
  const ids = new Set(order.vehicleIds);
  const late = order.expectedArrivalAt ? Math.round((now - new Date(order.expectedArrivalAt).getTime()) / MINUTE) : 0;
  const updated = pushEvent(
    { ...order, status: 'COMPLETED', completedAt: iso(now) },
    {
      at: iso(now),
      status: 'COMPLETED',
      actor,
      note: late > 0 ? `Đã giao đủ ${order.quantity} xe (trễ ${late} phút)` : `Đã giao đủ ${order.quantity} xe`,
    },
  );
  return {
    ok: true,
    message: `Lệnh ${order.code} hoàn thành: ${order.quantity} xe đã tới Hub đích.`,
    state: {
      ...replaceOrder(state, updated),
      vehicles: state.vehicles.map((vehicle) =>
        ids.has(vehicle.id) ? { ...vehicle, hubId: order.destHubId, status: 'available' } : vehicle,
      ),
      hubs: state.hubs.map((hub) =>
        hub.id === order.destHubId
          ? { ...hub, occupiedParking: Math.min(hub.capacity, hub.occupiedParking + order.quantity) }
          : hub,
      ),
    },
  };
}

/** cancelOrder: chỉ hủy được khi chưa vận chuyển; mở khóa xe tại Hub nguồn. */
export function cancelDispatchOrder(
  state: DispatchState,
  orderId: string,
  reason: string,
  actor: string,
  now: number,
): DispatchResult {
  const order = findOrder(state, orderId);
  if (!order) return fail('Không tìm thấy lệnh điều phối.');
  if (order.status !== 'PENDING' && order.status !== 'ASSIGNED') {
    return fail('Chỉ hủy được lệnh chưa bắt đầu vận chuyển.');
  }
  const ids = new Set(order.vehicleIds);
  const note = reason.trim() || 'Không ghi lý do';
  const updated = pushEvent(
    { ...order, status: 'CANCELLED', cancelledAt: iso(now), cancelReason: note },
    { at: iso(now), status: 'CANCELLED', actor, note },
  );
  return {
    ok: true,
    message: `Đã hủy lệnh ${order.code}, ${order.quantity} xe được mở khóa tại Hub nguồn.`,
    state: {
      ...replaceOrder(state, updated),
      vehicles: state.vehicles.map((vehicle) =>
        ids.has(vehicle.id) && vehicle.status === 'dispatching' ? { ...vehicle, status: 'available' } : vehicle,
      ),
    },
  };
}

/** Tiến độ vận chuyển (0–1) và số phút trễ so với dự kiến. */
export function transitProgress(order: DispatchOrder, now: number) {
  if (order.status !== 'IN_TRANSIT' || !order.startedAt || !order.expectedArrivalAt) {
    return { progress: order.status === 'COMPLETED' ? 1 : 0, remainingMinutes: 0, lateMinutes: 0 };
  }
  const start = new Date(order.startedAt).getTime();
  const end = new Date(order.expectedArrivalAt).getTime();
  const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  return {
    progress,
    remainingMinutes: Math.max(0, Math.ceil((end - now) / MINUTE)),
    lateMinutes: Math.max(0, Math.floor((now - end) / MINUTE)),
  };
}

/** Thời gian thực tế của lệnh đã hoàn thành (phút, từ lúc xuất phát). */
export const actualTransitMinutes = (order: DispatchOrder) =>
  order.startedAt && order.completedAt
    ? Math.round((new Date(order.completedAt).getTime() - new Date(order.startedAt).getTime()) / MINUTE)
    : null;

export interface RebalanceSuggestion {
  from: Hub;
  to: Hub;
  quantity: number;
  reason: string;
}

/**
 * Gợi ý cân bằng xe: Hub có số xe khả dụng (tính cả xe đang đến) dưới 15% sức chứa
 * nhận xe từ Hub dư nhiều xe nhất.
 */
export function suggestRebalancing(state: DispatchState): RebalanceSuggestion[] {
  const supply = (hub: Hub) =>
    state.vehicles.filter((vehicle) => vehicle.hubId === hub.id && vehicle.status === 'available').length;
  const projected = (hub: Hub) => supply(hub) + inboundReserved(state.dispatchOrders, hub.id);
  const target = (hub: Hub) => Math.max(2, Math.ceil(hub.capacity * 0.15));
  const suggestions: RebalanceSuggestion[] = [];
  const spare = new Map(state.hubs.map((hub) => [hub.id, supply(hub) - target(hub)]));
  state.hubs
    .filter((hub) => hub.status !== 'maintenance' && projected(hub) < target(hub))
    .sort((a, b) => projected(a) - projected(b))
    .forEach((hub) => {
      const need = Math.min(target(hub) - projected(hub), destinationFreeSlots(state, hub.id));
      const donor = state.hubs
        .filter((item) => item.id !== hub.id && (spare.get(item.id) ?? 0) > 0)
        .sort((a, b) => (spare.get(b.id) ?? 0) - (spare.get(a.id) ?? 0))[0];
      if (!donor || need <= 0) return;
      const quantity = Math.min(need, spare.get(donor.id) ?? 0);
      spare.set(donor.id, (spare.get(donor.id) ?? 0) - quantity);
      suggestions.push({
        from: donor,
        to: hub,
        quantity,
        reason: `${hub.name} chỉ còn ${projected(hub)} xe khả dụng (ngưỡng ${target(hub)}).`,
      });
    });
  return suggestions;
}

export const pickDispatchState = (data: DispatchState): DispatchState => ({
  hubs: data.hubs,
  vehicles: data.vehicles,
  dispatchOrders: data.dispatchOrders,
  dispatchStaff: data.dispatchStaff,
  chargingRequests: data.chargingRequests,
});
