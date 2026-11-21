import { db, loadState } from '../db';
import { WhatIfEngine } from '../../core/subsystems/network-operations/simulation/WhatIfEngine';
import { SqliteScenarioRepository } from './scenarioRepository';
import type { WhatIfScenario } from '../../core/shared/types/simulation';

const engine = new WhatIfEngine();
const repository = new SqliteScenarioRepository(db);
const pending = new Map<string, { userId: string; result: ReturnType<WhatIfEngine['run']> }>();
import { randomUUID } from 'node:crypto';

export function simulationRequest(method: string, path: string, body: Record<string, unknown>, userId: string) {
  if (method === 'GET' && path === '/api/simulation/saved') return { items: repository.list() };
  if (method === 'POST' && path === '/api/simulation/run') {
    const state = loadState();
    const result = engine.run({ hubs: state.hubs, vehicles: state.vehicles }, body.scenario as WhatIfScenario);
    const runId = randomUUID();
    if (pending.size >= 100) pending.delete(pending.keys().next().value!);
    pending.set(runId, { userId, result });
    return { runId, result };
  }
  if (method === 'POST' && path === '/api/simulation/save') {
    const run = pending.get(String(body.runId));
    if (!run || run.userId !== userId) throw new Error('Kết quả đã hết hạn hoặc không thuộc phiên của bạn. Hãy chạy lại mô phỏng.');
    const item = repository.save(run.result);
    pending.delete(String(body.runId));
    return { item };
  }
  throw new Error('Yêu cầu mô phỏng không hợp lệ.');
}
