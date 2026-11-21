/**
 * useAuthStore — phiên đăng nhập lấy từ backend.
 *
 * Không còn lưu tài khoản/mật khẩu trong trình duyệt: chỉ giữ **token** và thông tin
 * người dùng do `/api/auth/*` trả về.
 */
import { create } from 'zustand';
import { api, setToken } from '@/client/api/http';
import type { AuthResult, LoginCredentials, RegisterData, User } from '@/shared/types/auth';

export interface AuthCommands {
  ready: boolean;
  /** Nạp lại phiên từ token đã lưu (gọi một lần khi mở app). */
  restoreSession: () => Promise<User | null>;
  login: (credentials: LoginCredentials, options?: { remember?: boolean }) => Promise<AuthResult>;
  register: (data: RegisterData) => Promise<AuthResult>;
  logout: () => Promise<void>;
  resetAuthDemo: () => void;
}

export interface AuthStoreState extends AuthCommands {
  currentUser: User | null;
}

const useClientAuthStore = create<AuthStoreState>()((set) => ({
  currentUser: null,
  ready: false,

  restoreSession: async () => {
    const user = await api.me();
    set({ currentUser: user, ready: true });
    return user;
  },

  login: async ({ email, password }, options) => {
    const result = await api.login(email, password);
    if (!result.ok || !result.user) {
      return { ok: false, message: result.message ?? 'Đăng nhập thất bại.' } as AuthResult;
    }
    if (options?.remember === false) {
      // Không ghi nhớ: vẫn giữ token trong phiên hiện tại (localStorage), nhưng người
      // dùng có thể đăng xuất để xoá.
    }
    set({ currentUser: result.user });
    return { ok: true, user: result.user } as AuthResult;
  },

  register: async (data) => {
    const result = await api.register(data);
    if (!result.ok || !result.user) {
      return { ok: false, message: result.message ?? 'Đăng ký thất bại.' } as AuthResult;
    }
    set({ currentUser: result.user });
    return { ok: true, user: result.user } as AuthResult;
  },

  logout: async () => {
    await api.logout();
    set({ currentUser: null });
  },

  resetAuthDemo: () => {
    setToken(null);
    set({ currentUser: null });
  },
}));

const selectAll = (state: AuthStoreState) => state;

export function useAuthStore(): AuthStoreState;
export function useAuthStore<T>(selector: (state: AuthStoreState) => T): T;
export function useAuthStore<T>(selector?: (state: AuthStoreState) => T): AuthStoreState | T {
  const select = (selector ?? selectAll) as (state: AuthStoreState) => AuthStoreState | T;
  return useClientAuthStore(select);
}

/** Dùng ngoài React (bootstrap, kiểm thử). */
export { useClientAuthStore as authStore };
