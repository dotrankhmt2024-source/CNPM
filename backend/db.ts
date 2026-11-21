/**
 * SQLite của backend (dùng module có sẵn `node:sqlite`, không cần cài thêm gì).
 *
 * - `app_state`  : giữ toàn bộ AppData dưới dạng JSON (một dòng) — phù hợp bản MVP
 *                  vì các service hiện tại làm việc trên ảnh chụp dữ liệu.
 * - `users`      : tài khoản, mật khẩu đã băm bằng scrypt.
 * - `sessions`   : token đăng nhập (Bearer) kèm hạn dùng.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createInitialData } from '@/demo/seed';
import type { AppData } from '@/shared/types/domain';

const databaseFile = process.env.SEMH_DB ?? resolve(process.cwd(), 'backend/data/semh.db');
mkdirSync(dirname(databaseFile), { recursive: true });

export const db = new DatabaseSync(databaseFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

/* ------------------------------ Dữ liệu vận hành ------------------------------ */

export function loadState(): AppData {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get() as { data?: string } | undefined;
  if (!row?.data) {
    const seed = createInitialData();
    saveState(seed);
    return seed;
  }
  return JSON.parse(row.data) as AppData;
}

export function saveState(data: AppData): void {
  db.prepare(
    `INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(data), new Date().toISOString());
}

export function resetState(): AppData {
  const seed = createInitialData();
  saveState(seed);
  return seed;
}
