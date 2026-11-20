/**
 * Tính toán thuần của nghiệp vụ điều phối xe (shared kernel).
 *
 * Các hàm chỉ đọc dữ liệu và trả về con số/đề xuất, không ghi state — dùng chung cho
 * DispatchService (ra quyết định) và giao diện nhà điều hành (xem trước, hiển thị).
 */
import type { AppData, DispatchOrder, DispatchStatus, Hub, Vehicle } from '@/shared/types/domain';

export type DispatchState = Pick<
  AppData,
  'hubs' | 'vehicles' | 'dispatchOrders' | 'dispatchStaff' | 'chargingRequests'
>;

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
    remainingMinutes: Math.max(0, Math.ceil((end - now) / 60_000)),
    lateMinutes: Math.max(0, Math.floor((now - end) / 60_000)),
  };
}

/** Thời gian thực tế của lệnh đã hoàn thành (phút, từ lúc xuất phát). */
export const actualTransitMinutes = (order: DispatchOrder) =>
  order.startedAt && order.completedAt
    ? Math.round((new Date(order.completedAt).getTime() - new Date(order.startedAt).getTime()) / 60_000)
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
