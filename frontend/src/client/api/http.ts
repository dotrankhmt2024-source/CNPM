/**
 * Lớp gọi HTTP tới backend (`backend/`).
 *
 * Token đăng nhập lưu trong localStorage; mọi lời gọi đều gắn `Authorization: Bearer`.
 * Nếu server trả 401 thì token được xoá để client quay về trang đăng nhập.
 */
import type { AppData } from '@/shared/types/domain';
import type { User } from '@/shared/types/auth';

const TOKEN_KEY = 'semh.token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* trình duyệt chặn localStorage — bỏ qua */
  }
};

export interface CommandResponse {
  ok: boolean;
  message: string;
  state?: AppData;
  [key: string]: unknown;
}

interface ApiEnvelope {
  ok?: boolean;
  message?: string;
  token?: string;
  user?: User;
  state?: AppData;
  [key: string]: unknown;
}

const request = async (path: string, init: RequestInit = {}): Promise<ApiEnvelope> => {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    setToken(null);
  }

  let body: ApiEnvelope = {};
  try {
    body = (await response.json()) as ApiEnvelope;
  } catch {
    body = { ok: false, message: `Phản hồi không hợp lệ (HTTP ${response.status}).` };
  }
  if (!response.ok && body.ok !== false) {
    body = { ...body, ok: false, message: body.message ?? `Lỗi HTTP ${response.status}.` };
  }
  return body;
};

export const api = {
  async me(): Promise<User | null> {
    if (!getToken()) return null;
    const body = await request('/api/me');
    return body.ok && body.user ? body.user : null;
  },

  async login(email: string, password: string) {
    const body = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (body.ok && body.token) setToken(body.token);
    return body as { ok: boolean; message?: string; user?: User; token?: string };
  },

  async register(input: { fullName: string; email: string; password: string; confirmPassword: string }) {
    if (input.password !== input.confirmPassword) {
      return { ok: false, message: 'Mật khẩu xác nhận không khớp.' };
    }
    const body = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: input.fullName, email: input.email, password: input.password }),
    });
    if (body.ok && body.token) setToken(body.token);
    return body as { ok: boolean; message?: string; user?: User; token?: string };
  },

  async logout(): Promise<void> {
    if (getToken()) await request('/api/auth/logout', { method: 'POST' });
    setToken(null);
  },

  async state(): Promise<AppData | null> {
    const body = await request('/api/state');
    return body.ok && body.state ? body.state : null;
  },

  async command(name: string, args: Record<string, unknown> = {}): Promise<CommandResponse> {
    const body = await request('/api/command', {
      method: 'POST',
      body: JSON.stringify({ name, args }),
    });
    return {
      ...body,
      ok: Boolean(body.ok),
      message: typeof body.message === 'string' ? body.message : '',
    };
  },

  async reset(): Promise<CommandResponse> {
    const body = await request('/api/reset', { method: 'POST' });
    return {
      ...body,
      ok: Boolean(body.ok),
      message: typeof body.message === 'string' ? body.message : '',
    };
  },
};
