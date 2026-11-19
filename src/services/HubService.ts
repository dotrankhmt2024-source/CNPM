import type { AppData, ChargerSlot, Hub } from '../types/domain';

/** Ngưỡng quá tải: tỷ lệ sử dụng >= 90%. */
export const OVERLOAD_THRESHOLD = 0.9;

export type HubStatus = 'normal' | 'warning' | 'maintenance';

export const hubLabel = (hub: Hub) => `${hub.name} - ${hub.location}`;
export const hubShort = (hub: Hub) => `HUB ${hub.code ?? hub.name}`;

export const utilizationRate = (hub: Hub): number =>
  hub.capacity > 0 ? hub.occupiedParking / hub.capacity : 0;

export const isOverloaded = (hub: Hub, threshold = OVERLOAD_THRESHOLD): boolean =>
  !hub.maintenance && hub.capacity > 0 && utilizationRate(hub) >= threshold;

export const vehicleCount = (hub: Hub): number => (hub.maintenance ? 0 : hub.availableVehicles ?? 0);

/** Hub đang bảo trì thì không còn chỗ/cổng sạc nào dùng được. */
export const freeSlots = (hub: Hub): number =>
  hub.maintenance ? 0 : Math.max(0, hub.capacity - hub.occupiedParking);

export const faultyChargerNos = (hub: Hub): number[] =>
  hub.maintenance ? Array.from({ length: hub.chargers }, (_, i) => i + 1) : hub.faultyChargerNos ?? [];

export const freeChargers = (hub: Hub): number =>
  Math.max(0, hub.chargers - hub.activeCharging - faultyChargerNos(hub).length);

/** Các Hub hiển thị ở màn "Trung tâm vận hành". */
export const overviewHubs = (data: Pick<AppData, 'hubs'>): Hub[] => data.hubs.filter((h) => h.onOverview);

export function hubStatus(hub: Hub): HubStatus {
  if (hub.maintenance) return 'maintenance';
  if (isOverloaded(hub) || vehicleCount(hub) === 0) return 'warning';
  return 'normal';
}

/** Các Hub lân cận của `hub` (nếu chưa khai báo thì lấy mọi Hub khác). */
export function nearbyHubs(data: Pick<AppData, 'hubs'>, hub: Hub | undefined): Hub[] {
  if (!hub) return [];
  const ids = hub.nearbyHubIds;
  return data.hubs.filter((h) => h.id !== hub.id && (!ids || ids.includes(h.id)));
}

export interface OperatorAlert {
  id: string;
  kind: 'overload' | 'incident';
  /** hubId với cảnh báo quá tải, incidentId với sự cố. */
  refId: string;
  hubId: string;
  text: string;
}

/** Cảnh báo vận hành (màn Trung tâm vận hành): Hub quá tải + sự cố chưa xử lý. */
export function buildAlerts(data: AppData): OperatorAlert[] {
  const alerts: OperatorAlert[] = [];
  overviewHubs(data).forEach((hub) => {
    if (hubStatus(hub) === 'warning') {
      alerts.push({ id: `overload-${hub.id}`, kind: 'overload', refId: hub.id, hubId: hub.id, text: `${hubShort(hub)} · Quá tải — cần điều phối` });
    }
  });
  data.incidents
    .filter((i) => !i.resolved)
    .forEach((i) => alerts.push({ id: `incident-${i.id}`, kind: 'incident', refId: i.id, hubId: i.hubId, text: i.message }));
  return alerts;
}

/** Số liệu tổng hợp cho 4 thẻ thống kê của màn "Trung tâm vận hành". */
export interface HubSummary {
  operating: number;
  total: number;
  needCheck: number;
  availableVehicles: number;
  inUseVehicles: number;
  totalSlots: number;
  freeSlots: number;
  totalChargers: number;
  freeChargers: number;
}

export function summarizeHubs(hubs: Hub[]): HubSummary {
  const sum = (f: (h: Hub) => number) => hubs.reduce((n, h) => n + f(h), 0);
  return {
    operating: hubs.filter((h) => !h.maintenance).length,
    total: hubs.length,
    needCheck: hubs.filter((h) => hubStatus(h) === 'warning').length,
    availableVehicles: sum(vehicleCount),
    inUseVehicles: sum((h) => h.inUseVehicles ?? 0),
    totalSlots: sum((h) => h.capacity),
    freeSlots: sum(freeSlots),
    totalChargers: sum((h) => h.chargers),
    freeChargers: sum(freeChargers),
  };
}

/** Gợi ý Hub nguồn để điều phối xe tới `hub`: Hub lân cận đầu tiên còn xe. */
export const suggestDonor = (data: Pick<AppData, 'hubs'>, hub: Hub): Hub | undefined =>
  nearbyHubs(data, hub).find((h) => vehicleCount(h) > 0);

/** "Các Hub còn xe gần Hub đích" (chưa chọn đích thì xét mọi Hub), nhiều xe trước. */
export function vehicleSources(data: Pick<AppData, 'hubs'>, dest?: Hub): { hub: Hub; count: number }[] {
  return (dest ? nearbyHubs(data, dest) : data.hubs)
    .map((hub) => ({ hub, count: vehicleCount(hub) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Các Hub thay thế khi `hub` quá tải: Hub lân cận còn chỗ, nhiều chỗ trước. */
export const replacementHubs = (data: Pick<AppData, 'hubs'>, hub?: Hub): Hub[] =>
  nearbyHubs(data, hub).filter((h) => freeSlots(h) > 0).sort((a, b) => freeSlots(b) - freeSlots(a));

export type ChargerState = 'busy' | 'free' | 'fault';

/** Trạng thái từng cổng sạc: cổng bảo trì theo số thứ tự khai báo, cổng đang dùng dồn lên đầu dãy. */
export function chargerStates(hub: Hub): { no: number; code: string; state: ChargerState }[] {
  const faulty = faultyChargerNos(hub);
  return Array.from({ length: hub.chargers }, (_, i) => {
    const no = i + 1;
    const state: ChargerState = faulty.includes(no)
      ? 'fault'
      : no <= hub.activeCharging + faulty.filter((f) => f < no).length
        ? 'busy'
        : 'free';
    return { no, code: `CS-${String(no).padStart(2, '0')}`, state };
  });
}

export const scheduledCount = (data: Pick<AppData, 'chargerSlots'>, hubId: string): number =>
  data.chargerSlots.filter((c) => c.hubId === hubId).length;

export const chargerSchedule = (data: Pick<AppData, 'chargerSlots'>, hubId: string, chargerNo: number): ChargerSlot[] =>
  data.chargerSlots.filter((c) => c.hubId === hubId && c.chargerNo === chargerNo);
