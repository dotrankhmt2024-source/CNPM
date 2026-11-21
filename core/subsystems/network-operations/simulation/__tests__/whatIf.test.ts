import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { WhatIfEngine } from '../WhatIfEngine';
import { SqliteScenarioRepository } from '../../../../../backend/simulation/scenarioRepository';
import type { NetworkSnapshot, WhatIfScenario } from '../../../../shared/types/simulation';

const snapshot: NetworkSnapshot = {
  hubs: [
    { id: 'a', name: 'A', location: '', capacity: 10, occupiedParking: 8, chargers: 2, activeCharging: 1, status: 'normal' },
    { id: 'b', name: 'B', location: '', capacity: 20, occupiedParking: 2, chargers: 2, activeCharging: 0, status: 'normal' },
  ], vehicles: [],
};
const scenario: WhatIfScenario = { name: 'Metro', hubIds: ['a'], durationMinutes: 10,
  demandGrowthPercent: 0, arrivalsPerMinute: 1, departuresPerMinute: 0,
  disabledChargers: 0, capacityReductionPercent: 0, chargingDemand: 5,
  averageSessionMinutes: 30, energyPerSessionKwh: 2 };
describe('What-if', () => {
  const engine = new WhatIfEngine();
  it('uses parameters, preserves overflow and never mutates the snapshot', () => {
    const before = structuredClone(snapshot);
    const result = engine.run(snapshot, scenario);
    expect(result.hubs[0].overflow).toBe(8);
    expect(result.summary.energyDemandKwh).toBe(10);
    expect(result.recommendations.map(r => r.kind)).toEqual(expect.arrayContaining(['redirect', 'charging']));
    expect(engine.run(snapshot, { ...scenario, arrivalsPerMinute: 2 }).hubs[0].overflow).toBe(18);
    result.snapshot.hubs[0].capacity = 0;
    expect(snapshot).toEqual(before);
  });
  it('rejects invalid inputs and unknown hubs', () => {
    for (const patch of [{ arrivalsPerMinute: -1 }, { durationMinutes: NaN }, { hubIds: ['missing'] }, { disabledChargers: 3 }]) {
      expect(() => engine.run(snapshot, { ...scenario, ...patch })).toThrow();
    }
  });
  it('reports unavailable charging without infinite JSON values', () => {
    const result = engine.run(snapshot, { ...scenario, disabledChargers: 2, capacityReductionPercent: 100 });
    expect(result.hubs[0].waitMinutes).toBeNull();
    expect(result.hubs[0].overflow).toBe(18);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it('persists the complete snapshot and result in SQLite', () => {
    const db = new DatabaseSync(':memory:');
    try {
      const repository = new SqliteScenarioRepository(db);
      const saved = engine.runAndSave(snapshot, scenario, repository);
      expect(new SqliteScenarioRepository(db).get(saved.id)).toEqual(saved);
      expect(repository.list()).toEqual([saved]);
      expect(repository.get('missing')).toBeNull();
    } finally { db.close(); }
  });
});
