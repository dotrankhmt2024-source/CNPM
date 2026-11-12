import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mockUsers } from '../mocks/users.ts';
import type {
  AuthResult,
  LoginCredentials,
  MockAccount,
  RegisterData,
  User,
} from '../types/auth';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const toPublicUser = ({ password: _password, ...user }: MockAccount): User => {
  void _password;
  return user;
};

type AuthStore = {
  currentUser: User | null;
  registeredUsers: MockAccount[];
  /** Người dùng chọn "Ghi nhớ đăng nhập" thì phiên mới được lưu vào localStorage. */
  rememberSession: boolean;
  login: (credentials: LoginCredentials, options?: { remember?: boolean }) => AuthResult;
  register: (data: RegisterData) => AuthResult;
  logout: () => void;
  resetAuthDemo: () => void;
};

/**
 * Frontend-only demo: đăng nhập/đăng ký thực hiện ngay trên trình duyệt.
 * KHÔNG bảo mật: mật khẩu tài khoản mới lưu localStorage dưới dạng rõ.
 * Chỉ nhập dữ liệu giả lập; không dùng trong production.
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      currentUser: null,
      registeredUsers: [],
      rememberSession: true,

      login: ({ email, password }, options) => {
        const normalized = normalizeEmail(email);
        const account = [...mockUsers, ...get().registeredUsers].find(
          (user) => normalizeEmail(user.email) === normalized,
        );
        if (!account || account.password !== password) {
          return { ok: false, message: 'Email hoặc mật khẩu không chính xác.' };
        }
        const user = toPublicUser(account);
        set({ currentUser: user, rememberSession: options?.remember ?? true });
        return { ok: true, user };
      },

      register: (data) => {
        const fullName = data.fullName.trim();
        const email = normalizeEmail(data.email);
        if (!fullName || !email || !data.password || !data.confirmPassword) {
          return { ok: false, message: 'Vui lòng nhập đầy đủ thông tin.' };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { ok: false, message: 'Email không hợp lệ.' };
        }
        if (data.password.length < 8) {
          return { ok: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' };
        }
        if (data.password !== data.confirmPassword) {
          return { ok: false, message: 'Mật khẩu xác nhận không khớp.' };
        }
        if ([...mockUsers, ...get().registeredUsers].some(
          (account) => normalizeEmail(account.email) === email,
        )) {
          return { ok: false, message: 'Email đã được đăng ký.' };
        }
        const account: MockAccount = {
          id: `student-${crypto.randomUUID()}`,
          fullName,
          email,
          password: data.password,
          role: 'student', // Không cho phép tự đăng ký Operator.
          createdAt: new Date().toISOString(),
        };
        const user = toPublicUser(account);
        set((state) => ({
          registeredUsers: [...state.registeredUsers, account],
          currentUser: user,
          rememberSession: true,
        }));
        return { ok: true, user };
      },

      logout: () => set({ currentUser: null }),
      resetAuthDemo: () => set({ currentUser: null, registeredUsers: [] }),
    }),
    {
      name: 'smart-hub-auth-demo-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Không ghi nhớ đăng nhập thì chỉ giữ phiên trong bộ nhớ, refresh là mất.
        currentUser: state.rememberSession ? state.currentUser : null,
        registeredUsers: state.registeredUsers,
        rememberSession: state.rememberSession,
      }),
    },
  ),
);
