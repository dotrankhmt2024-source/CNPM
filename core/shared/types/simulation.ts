import type { Hub, Vehicle } from './domain';

export interface WhatIfScenario {
  name: string;
  hubIds: string[];
  durationMinutes: number;
  demandGrowthPercent: number;
  arrivalsPerMinute: number;
  departuresPerMinute: number;
  disabledChargers: number;
  capacityReductionPercent: number;
  chargingDemand: number;
  averageSessionMinutes: number;
  energyPerSessionKwh: number;
}

export interface NetworkSnapshot { hubs: Hub[]; vehicles: Vehicle[] }
export interface HubImpact {
  hubId: string;
  name: string;
  capacity: number;
  currentOccupancy: number;
  projectedOccupancy: number;
  overflow: number;
  utilization: number;
  availableVehicles: number;
  vehicleShortage: number;
  freeChargers: number;
  chargingQueue: number;
  /** null means no operational charger; waiting time cannot be estimated. */
  waitMinutes: number | null;
  energyDemandKwh: number;
}
export interface Recommendation {
  kind: 'dispatch' | 'redirect' | 'charging' | 'monitor';
  hubId: string;
  targetHubId?: string;
  quantity?: number;
  message: string;
}
export interface WhatIfResult {
  scenario: WhatIfScenario;
  snapshot: NetworkSnapshot;
  hubs: HubImpact[];
  recommendations: Recommendation[];
  summary: { overloadedHubs: number; averageUtilization: number; energyDemandKwh: number };
  assumptions: string[];
}
export interface SavedScenario { id: string; createdAt: string; result: WhatIfResult }
export interface ScenarioRepository {
  save(result: WhatIfResult): SavedScenario;
  list(): SavedScenario[];
  get(id: string): SavedScenario | null;
}
