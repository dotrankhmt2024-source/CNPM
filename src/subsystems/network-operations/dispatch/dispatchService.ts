/**
 * Logic nghiệp vụ thuần của phân hệ điều phối xe giữa các Hub
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
 *
 * Các phép tính chỉ-đọc (khoảng cách, ETA, sức chứa, gợi ý cân bằng) nằm ở
 * `shared/domain/dispatchMath` và được export lại ở đây để không đổi API cũ.
 */
import type { DispatchEvent, DispatchOrder, Vehicle } from '@/shared/types/domain';
import { MINUTE } from '@/shared/clock';
import { occupyFreeSlots, releaseUsedSlots } from '@/shared/domain/parkingMath';
import {
  capacityWarning,
  checkDestinationCapacity,
  destinationFreeSlots,
  dispatchableVehicles,
  estimateEtaMinutes,
  hubDistanceKm,
  type DispatchState,
} from '@/shared/domain/dispatchMath';

export * from '@/shared/domain/dispatchMath';

export type DispatchResult<T = unknown> =
  | ({ ok: true; message: string; state: DispatchState } & T)
  | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const iso = (time: number) => new Date(time).toISOString();

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
    return fail(
      order.status === 'PENDING'
        ? 'Cần phân công nhân viên trước khi vận chuyển.'
        : 'Lệnh không ở trạng thái chờ vận chuyển.',
    );
  }
  const ids = new Set(order.vehicleIds);
  const expectedArrivalAt = iso(now + order.etaMinutes * MINUTE);
  const updated = pushEvent(
    { ...order, status: 'IN_TRANSIT', startedAt: iso(now), expectedArrivalAt },
    {
      at: iso(now),
      status: 'IN_TRANSIT',
      actor,
      note: `Xuất phát, dự kiến tới lúc ${new Date(expectedArrivalAt).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    },
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
      parkingSlots: releaseUsedSlots(state.parkingSlots, order.sourceHubId, order.quantity),
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
      parkingSlots: occupyFreeSlots(state.parkingSlots, order.destHubId, order.quantity),
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

export const pickDispatchState = (data: DispatchState): DispatchState => ({
  hubs: data.hubs,
  vehicles: data.vehicles,
  dispatchOrders: data.dispatchOrders,
  dispatchStaff: data.dispatchStaff,
  chargingRequests: data.chargingRequests,
  parkingSlots: data.parkingSlots,
});
