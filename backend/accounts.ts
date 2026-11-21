/**
 * Tài khoản & phiên đăng nhập phía server.
 *
 * Mật khẩu được băm bằng scrypt (kèm salt ngẫu nhiên)
 */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import type { User, UserRole } from '@/shared/types/auth';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  password_hash: string;
  created_at: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const toPublicUser = (row: UserRow): User => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
});

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;
}

export function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}): User {
  const row: UserRow = {
    id: `${input.role === 'operator' ? 'operator' : 'student'}-${randomUUID()}`,
    email: input.email.trim().toLowerCase(),
    full_name: input.fullName.trim(),
    role: input.role,
    password_hash: hashPassword(input.password),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO users (id, email, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(row.id, row.email, row.full_name, row.role, row.password_hash, row.created_at);
  return toPublicUser(row);
}

/** Tạo tài khoản demo cố định nếu database còn trống. */
export function ensureDemoAccounts(): void {
  const count = db.prepare('SELECT COUNT(*) AS total FROM users').get() as { total: number };
  if (count.total > 0) return;
  createUser({ fullName: 'Sinh viên Demo', email: 'student@demo.local', password: 'Student123!', role: 'student' });
  createUser({ fullName: 'Nhà điều hành Demo', email: 'operator@demo.local', password: 'Operator123!', role: 'operator' });
}

export function login(email: string, password: string): { ok: true; user: User; token: string } | { ok: false; message: string } {
  const row = findUserByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return { ok: false, message: 'Email hoặc mật khẩu không chính xác.' };
  }
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    row.id,
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString(),
  );
  return { ok: true, user: toPublicUser(row), token };
}

export function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .get(token) as { user_id: string; expires_at: string } | undefined;
  if (!session) return null;
  if (Date.parse(session.expires_at) < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined;
  return row ? toPublicUser(row) : null;
}

export function logout(token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
