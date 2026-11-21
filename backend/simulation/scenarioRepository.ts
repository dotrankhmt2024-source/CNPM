import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SavedScenario, ScenarioRepository, WhatIfResult } from '../../core/shared/types/simulation';

/** Pass the existing backend db or an isolated database for tests. */
export class SqliteScenarioRepository implements ScenarioRepository {
  constructor(private readonly database: DatabaseSync) {
    database.exec('CREATE TABLE IF NOT EXISTS what_if_scenarios (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, result TEXT NOT NULL)');
  }
  save(result: WhatIfResult): SavedScenario {
    const item = { id: randomUUID(), createdAt: new Date().toISOString(), result: structuredClone(result) };
    this.database.prepare('INSERT INTO what_if_scenarios VALUES (?, ?, ?)').run(item.id, item.createdAt, JSON.stringify(item.result));
    return item;
  }
  list(): SavedScenario[] {
    return this.database.prepare('SELECT * FROM what_if_scenarios ORDER BY created_at DESC, id').all().map(row => this.decode(row));
  }
  get(id: string): SavedScenario | null {
    const row = this.database.prepare('SELECT * FROM what_if_scenarios WHERE id = ?').get(id);
    return row ? this.decode(row) : null;
  }
  private decode(row: Record<string, unknown>): SavedScenario {
    return { id: String(row.id), createdAt: String(row.created_at), result: JSON.parse(String(row.result)) as WhatIfResult };
  }
}
