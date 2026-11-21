/**
 * HTTP server của SEMH (Node built-in, không cần framework).
 *
 *  GET  /api/health
 *  POST /api/auth/register   { fullName, email, password }
 *  POST /api/auth/login      { email, password }
 *  POST /api/auth/logout
 *  GET  /api/me
 *  GET  /api/state
 *  POST /api/command         { name, args }   (cần Bearer token)
 *  POST /api/reset           (nhà điều hành)
 *
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createUser, ensureDemoAccounts, findUserByEmail, login, logout, userFromToken } from './accounts';
import { runCommand } from './commands';
import { resetDemoData } from './services';
import { createServices } from './services';
import { loadState } from './db';
import { simulationRequest } from './simulation/routes';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DIST_DIR = resolve(process.cwd(), 'dist');
const MAX_BODY_BYTES = 1_000_000;

type Json = Record<string, unknown>;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res: ServerResponse, status: number, body: Json | unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Dữ liệu gửi lên quá lớn');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
  } catch {
    throw new Error('JSON không hợp lệ');
  }
}

const bearer = (req: IncomingMessage) => {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : undefined;
};

function serveStatic(res: ServerResponse, urlPath: string) {
  const safePath = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const candidate = join(DIST_DIR, safePath);
  const filePath =
    candidate.startsWith(DIST_DIR) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(DIST_DIR, 'index.html');
  if (!existsSync(filePath)) return false;
  const body = readFileSync(filePath);
  res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  res.end(body);
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,authorization',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-max-age': '600',
    });
    res.end();
    return;
  }

  try {
    if (path === '/api/health') return sendJson(res, 200, { ok: true, service: 'semh-api', time: new Date().toISOString() });

    if (path === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const fullName = String(body.fullName ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!fullName || !email || !password) return sendJson(res, 400, { ok: false, message: 'Vui lòng nhập đầy đủ thông tin.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { ok: false, message: 'Email không hợp lệ.' });
      if (password.length < 8) return sendJson(res, 400, { ok: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
      if (findUserByEmail(email)) return sendJson(res, 409, { ok: false, message: 'Email đã được đăng ký.' });
      createUser({ fullName, email, password, role: 'student' });
      const session = login(email, password);
      if (!session.ok) return sendJson(res, 500, session);
      return sendJson(res, 201, { ok: true, user: session.user, token: session.token });
    }

    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const result = login(String(body.email ?? ''), String(body.password ?? ''));
      return sendJson(res, result.ok ? 200 : 401, result);
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      logout(bearer(req));
      return sendJson(res, 200, { ok: true, message: 'Đã đăng xuất.' });
    }

    const user = userFromToken(bearer(req));

    if (path.startsWith('/api/simulation/')) {
      if (!user) return sendJson(res, 401, { ok: false, message: 'Chưa đăng nhập.' });
      if (user.role !== 'operator') return sendJson(res, 403, { ok: false, message: 'Chỉ nhà điều hành được mô phỏng.' });
      const body = req.method === 'POST' ? await readBody(req) : {};
      try {
        return sendJson(res, 200, { ok: true, ...simulationRequest(req.method ?? '', path, body, user.id) });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : 'Thông số không hợp lệ.' });
      }
    }

    if (path === '/api/me' && req.method === 'GET') {
      return sendJson(res, user ? 200 : 401, user ? { ok: true, user } : { ok: false, message: 'Chưa đăng nhập.' });
    }

    if (path === '/api/state' && req.method === 'GET') {
      if (!user) return sendJson(res, 401, { ok: false, message: 'Chưa đăng nhập.' });
      return sendJson(res, 200, { ok: true, state: loadState() });
    }

    if (path === '/api/command' && req.method === 'POST') {
      if (!user) return sendJson(res, 401, { ok: false, message: 'Chưa đăng nhập.' });
      const body = await readBody(req);
      const name = String(body.name ?? '');
      const args = (body.args ?? {}) as Record<string, unknown>;
      if (name.startsWith('operator.') && user.role !== 'operator') {
        return sendJson(res, 403, { ok: false, message: 'Chỉ nhà điều hành được thực hiện thao tác này.' });
      }
      if (name.startsWith('student.') && user.role !== 'student') {
        return sendJson(res, 403, { ok: false, message: 'Chỉ sinh viên được thực hiện thao tác này.' });
      }
      const services = createServices(user);
      const result = runCommand(name, args, services);
      return sendJson(res, 200, { ...result, state: loadState() });
    }

    if (path === '/api/reset' && req.method === 'POST') {
      if (!user || user.role !== 'operator') return sendJson(res, 403, { ok: false, message: 'Không có quyền.' });
      resetDemoData();
      return sendJson(res, 200, { ok: true, message: 'Đã khôi phục dữ liệu demo.', state: loadState() });
    }

    if (path.startsWith('/api/')) return sendJson(res, 404, { ok: false, message: 'Không tìm thấy API.' });

    if (serveStatic(res, path)) return;
    return sendJson(res, 404, { ok: false, message: 'Không tìm thấy.' });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : 'Lỗi server',
    });
  }
});

ensureDemoAccounts();
loadState();

server.listen(PORT, HOST, () => {
  console.log(`SEMH API đang chạy tại http://localhost:${PORT}`);
  console.log(`Tài khoản demo: student@demo.local / Student123!  ·  operator@demo.local / Operator123!`);
});
