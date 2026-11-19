import type { AppData, Hub } from '../types/domain';
import { faultyChargerNos, OVERLOAD_THRESHOLD, overviewHubs, vehicleCount, type HubStatus } from './HubService';
export interface SimulationResult { hubName:string; currentOccupancy:number; projectedOccupancy:number; overflow:number; recommendation:string; }
export function simulateDemand(data:AppData,extraArrivals:number):SimulationResult[]{
 // Pure function: does not mutate the operational state.
 return data.hubs.map(h=>{
  const projectedOccupancy=h.occupiedParking+extraArrivals;
  const overflow=Math.max(0,projectedOccupancy-h.capacity);
  return {hubName:h.name,currentOccupancy:h.occupiedParking,projectedOccupancy,overflow,
   recommendation:overflow>0?`Dự kiến thiếu ${overflow} chỗ; điều hướng sang Hub khác`:'Còn khả năng phục vụ'};
 });
}

/* ====== What-if ====== */

export interface WhatIfValues {
  demandGrowthPct: number;
  brokenVehiclesPct: number;
  originHubId: string;
  initialVehicles: number;
  arrivalsPerMinute: number;
  avgBatteryPct: number;
  durationMinutes: number;
  priorityThreshold: number;
  stoppedChargers: number;
  holdMinutes: number;
  capacityReductionPct: number;
  priorityWeightPct: number;
}
export type WhatIfKey = keyof WhatIfValues;
/** 'all' = toàn bộ hệ thống, hoặc danh sách id Hub cụ thể. */
export type Scope = 'all' | string[];
export type WhatIfScopes = Partial<Record<WhatIfKey, Scope>>;

export interface WhatIfDef {
  key: WhatIfKey;
  label: string;
  kind: 'number' | 'hub';
  unit: string;
  /** Có hỏi "Phạm vi áp dụng" khi đổi tham số không. */
  scoped: boolean;
  min?: number;
  max?: number;
}

/** Thứ tự = từng hàng, trái → phải. */
export const whatIfDefs: WhatIfDef[] = [
  { key: 'demandGrowthPct', label: 'Tỉ lệ gia tăng nhu cầu', kind: 'number', unit: '%', scoped: true, min: 0, max: 500 },
  { key: 'brokenVehiclesPct', label: 'Số lượng xe hỏng', kind: 'number', unit: '%', scoped: true, min: 0, max: 100 },
  { key: 'originHubId', label: 'Hub khởi phát tắc nghẽn', kind: 'hub', unit: '', scoped: false },
  { key: 'initialVehicles', label: 'Số xe ban đầu', kind: 'number', unit: '', scoped: false, min: 1, max: 100000 },
  { key: 'arrivalsPerMinute', label: 'Lượng sinh viên đến Hub/phút', kind: 'number', unit: '', scoped: false, min: 0, max: 10000 },
  { key: 'avgBatteryPct', label: 'Mức pin trung bình của xe', kind: 'number', unit: '%', scoped: false, min: 0, max: 100 },
  { key: 'durationMinutes', label: 'Thời gian mô phỏng', kind: 'number', unit: ' phút', scoped: false, min: 1, max: 1440 },
  { key: 'priorityThreshold', label: 'Ngưỡng pin ưu tiên sạc', kind: 'number', unit: '%', scoped: false, min: 0, max: 100 },
  { key: 'stoppedChargers', label: 'Số cổng sạc ngừng hoạt động', kind: 'number', unit: '', scoped: true, min: 0, max: 10000 },
  { key: 'holdMinutes', label: 'Thời gian giữ chỗ tạm thời', kind: 'number', unit: ' phút', scoped: false, min: 0, max: 240 },
  { key: 'capacityReductionPct', label: 'Sức chứa của Hub bị thu hẹp', kind: 'number', unit: '%', scoped: true, min: 0, max: 100 },
  { key: 'priorityWeightPct', label: 'Trọng số ưu tiên sạc', kind: 'number', unit: '%', scoped: false, min: 0, max: 100 },
];

export function defaultWhatIf(data: AppData): WhatIfValues {
  const origin = data.hubs.find((h) => h.code === 'C2') ?? data.hubs[0];
  return {
    demandGrowthPct: 20,
    brokenVehiclesPct: 20,
    originHubId: origin?.id ?? '',
    initialVehicles: overviewHubs(data).reduce((n, h) => n + (h.availableVehicles ?? 0) + (h.inUseVehicles ?? 0), 0),
    arrivalsPerMinute: 40,
    avgBatteryPct: 65,
    durationMinutes: 30,
    priorityThreshold: 20,
    stoppedChargers: 4,
    holdMinutes: 10,
    capacityReductionPct: 10,
    priorityWeightPct: 40,
  };
}

export function formatWhatIf(def: WhatIfDef, v: WhatIfValues, hubs: Hub[]): string {
  if (def.kind === 'hub') return hubs.find((h) => h.id === v[def.key])?.name ?? '—';
  return `${v[def.key]}${def.unit}`;
}

/** Tham số âm / Hub không tồn tại → không chạy mô phỏng. */
export function validateWhatIf(data: AppData, v: WhatIfValues): string | null {
  if (!data.hubs.some((h) => h.id === v.originHubId)) return 'Hub khởi phát không tồn tại';
  for (const d of whatIfDefs) {
    if (d.kind !== 'number') continue;
    const x = v[d.key] as number;
    if (!Number.isFinite(x)) return `${d.label}: giá trị không hợp lệ`;
    if (d.min !== undefined && x < d.min) return `${d.label} không được nhỏ hơn ${d.min}`;
    if (d.max !== undefined && x > d.max) return `${d.label} không được lớn hơn ${d.max}`;
  }
  return null;
}

export interface SimHub {
  hub: Hub;
  status: HubStatus;
  vehicles: number;
  freeSlots: number;
  freeChargers: number;
  vehicleAdvice: string[];
  parkingAdvice: string[];
  chargingAdvice: string[];
}

export const formatMinutes = (m: number): string => {
  if (m < 60) return `${m} phút`;
  if (m % 60 === 0) return `${m / 60} giờ`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
};

const inScope = (s: WhatIfScopes, key: WhatIfKey, hubId: string) => {
  const sc = s[key] ?? 'all';
  return sc === 'all' || sc.includes(hubId);
};

/** Mô phỏng thuần: không thay đổi dữ liệu vận hành thật. */
export function runWhatIf(data: AppData, v: WhatIfValues, scopes: WhatIfScopes): SimHub[] {
  const live = data.hubs.filter((h) => !h.maintenance);
  const baseFleet = overviewHubs(data).reduce((n, h) => n + (h.availableVehicles ?? 0) + (h.inUseVehicles ?? 0), 0);
  const scale = v.initialVehicles / Math.max(1, baseFleet);
  const DEMAND_FACTOR = 0.1; // giả định 10% lượt sinh viên đến phát sinh nhu cầu lấy/trả xe tại Hub
  const total = v.arrivalsPerMinute * v.durationMinutes * DEMAND_FACTOR;
  const otherCap = live.filter((h) => h.id !== v.originHubId).reduce((n, h) => n + h.capacity, 0) || 1;
  const lowFraction = v.avgBatteryPct <= v.priorityThreshold ? 1 : Math.min(1, Math.max(0, (100 - v.avgBatteryPct) / 100));

  const stoppedPool = (hubId: string) => {
    const pool = live.filter((h) => inScope(scopes, 'stoppedChargers', h.id));
    const base = pool.reduce((n, h) => n + h.chargers, 0) || 1;
    const h = live.find((x) => x.id === hubId);
    return h && inScope(scopes, 'stoppedChargers', hubId) ? Math.round((v.stoppedChargers * h.chargers) / base) : 0;
  };

  const base = data.hubs.map((hub) => {
    if (hub.maintenance) {
      return { hub, status: 'maintenance' as HubStatus, vehicles: 0, free: 0, charger: 0, projectedVehicles: 0, occupiedRatio: 0, overflowSlots: 0, overflowChargers: 0, workingChargers: 0 };
    }
    const share = hub.id === v.originHubId ? 0.4 : (hub.capacity / otherCap) * (live.some((h) => h.id === v.originHubId) ? 0.6 : 1);
    const growth = inScope(scopes, 'demandGrowthPct', hub.id) ? 1 + v.demandGrowthPct / 100 : 1;
    const inflow = Math.round(total * share * growth);
    const takes = Math.round(inflow * 0.5);
    const returns = inflow - takes;
    const broken = inScope(scopes, 'brokenVehiclesPct', hub.id) ? v.brokenVehiclesPct / 100 : 0;
    const availNow = Math.round(vehicleCount(hub) * scale);
    const presentNow = availNow;
    const availAfter = Math.round(availNow * (1 - broken));
    const projectedVehicles = Math.max(0, availAfter - takes);
    const reduction = inScope(scopes, 'capacityReductionPct', hub.id) ? v.capacityReductionPct / 100 : 0;
    const capEff = Math.floor(hub.capacity * (1 - reduction));
    const occupied = hub.occupiedParking + returns;
    const overflowSlots = Math.max(0, occupied - capEff);
    const working = Math.max(0, hub.chargers - faultyChargerNos(hub).length - stoppedPool(hub.id));
    const chargeDemand = hub.activeCharging + Math.round(takes * lowFraction * (1 + v.priorityWeightPct / 100));
    const overflowChargers = Math.max(0, chargeDemand - working);
    const status: HubStatus = occupied / Math.max(1, capEff) >= OVERLOAD_THRESHOLD || projectedVehicles === 0 || overflowChargers > 0 ? 'warning' : 'normal';
    return {
      hub, status,
      vehicles: Math.max(0, presentNow - takes + returns - (availNow - availAfter)),
      free: Math.max(0, capEff - occupied),
      charger: Math.max(0, working - chargeDemand),
      projectedVehicles, occupiedRatio: occupied / Math.max(1, capEff), overflowSlots, overflowChargers, workingChargers: working,
    };
  });

  const codes = (hubs: Hub[]) => `Hub ${hubs.map((h) => h.code ?? h.name).join(', ')}`;
  return base.map((b) => {
    const others = base.filter((o) => o.hub.id !== b.hub.id && o.status !== 'maintenance');
    const vehicleAdvice: string[] = [];
    const parkingAdvice: string[] = [];
    const chargingAdvice: string[] = [];
    if (b.status !== 'maintenance') {
      if (b.projectedVehicles === 0) {
        let need = Math.max(5, b.hub.capacity);
        others
          .filter((o) => o.projectedVehicles > 1)
          .sort((x, y) => y.projectedVehicles - x.projectedVehicles)
          .slice(0, 2)
          .forEach((o, k) => {
            const q = Math.min(Math.floor(o.projectedVehicles / 2), need);
            if (q < 1) return;
            need -= q;
            vehicleAdvice.push(`+ Điều phối ${q} xe từ ${o.hub.name} sau ${formatMinutes(v.durationMinutes * (k + 1))} chạy mô phỏng`);
          });
      }
      if (b.overflowSlots > 0 || b.free === 0) {
        const t = others.filter((o) => o.free > 0).sort((x, y) => y.free - x.free).slice(0, 2).map((o) => o.hub);
        if (t.length) parkingAdvice.push(`+ Điều hướng người dùng tới các ${codes(t)} sau ${formatMinutes(Math.round(v.durationMinutes * 1.5))} chạy mô phỏng`);
      }
      if (b.overflowChargers > 0 || b.workingChargers === 0) {
        const t = others.filter((o) => o.charger > 0).sort((x, y) => y.charger - x.charger).slice(0, 2).map((o) => o.hub);
        if (t.length) chargingAdvice.push(`Điều hướng người dùng tới các ${codes(t)} sau ${formatMinutes(v.durationMinutes * 3)} chạy mô phỏng`);
      }
    }
    return {
      hub: b.hub, status: b.status, vehicles: b.vehicles, freeSlots: b.status === 'maintenance' ? 0 : b.free,
      freeChargers: b.status === 'maintenance' ? 0 : b.charger, vehicleAdvice, parkingAdvice, chargingAdvice,
    };
  });
}

/** Số liệu 4 thẻ thống kê ở màn kết quả mô phỏng (chỉ các Hub của màn Trung tâm vận hành). */
export function summarizeSim(rows: SimHub[]) {
  const shown = rows.filter((r) => r.hub.onOverview);
  const live = shown.filter((r) => r.status !== 'maintenance');
  const sum = (list: SimHub[], f: (r: SimHub) => number) => list.reduce((n, r) => n + f(r), 0);
  return {
    shown,
    warnings: shown.filter((r) => r.status === 'warning'),
    operating: live.length,
    total: shown.length,
    vehicles: sum(shown, (r) => r.vehicles),
    freeSlots: sum(shown, (r) => r.freeSlots),
    totalSlots: sum(live, (r) => r.hub.capacity),
    freeChargers: sum(shown, (r) => r.freeChargers),
    totalChargers: sum(live, (r) => r.hub.chargers),
  };
}

/** Kiểm tra giá trị số người dùng nhập cho một tham số What-if. */
export function parseWhatIfNumber(def: WhatIfDef, raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw.trim().replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(n)) return { ok: false, error: 'Vui lòng nhập một số' };
  if (def.min !== undefined && n < def.min) return { ok: false, error: `Giá trị không được nhỏ hơn ${def.min}` };
  if (def.max !== undefined && n > def.max) return { ok: false, error: `Giá trị không được lớn hơn ${def.max}` };
  return { ok: true, value: n };
}
