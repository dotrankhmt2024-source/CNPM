/**
 * AccountService — component của subsystem Access & Identify.
 *
 * Cài đặt IAuth (đăng ký, đăng nhập, phiên làm việc) và ISetting (thiết lập cá nhân).
 * Không phụ thuộc React: dữ liệu đọc/ghi qua IAccountStore của DataStore.
 *
 * LƯU Ý: đây là bản demo chạy hoàn toàn trên trình duyệt, mật khẩu lưu dạng rõ
 * trong localStorage — không dùng cho sản phẩm thật.
 */
import type {
  IAccountStore,
  INotification,
  ISetting,
  IAuth,
  UserSettings,
} from '@/contracts/AccessIdentity';
import type { AuthResult, LoginCredentials, MockAccount, RegisterData, User } from '@/shared/types/auth';
import { mockUsers } from '@/demo/users';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toPublicUser = ({ password: _password, ...user }: MockAccount): User => {
  void _password;
  return user;
};

const DEFAULT_SETTINGS: Omit<UserSettings, 'userId'> = { notificationsEnabled: true, theme: 'light' };

export class AccountService implements IAuth, ISetting {
  constructor(
    private readonly store: IAccountStore,
    private readonly notification: INotification,
  ) {}

  /* ------------------------------- IAuth ------------------------------- */

  currentUser(): User | null {
    return this.store.read().currentUser;
  }

  login({ email, password }: LoginCredentials, options?: { remember?: boolean }): AuthResult {
    const normalized = normalizeEmail(email);
    const { registeredUsers } = this.store.read();
    const account = [...mockUsers, ...registeredUsers].find(
      (user) => normalizeEmail(user.email) === normalized,
    );
    if (!account || account.password !== password) {
      return { ok: false, message: 'Email hoặc mật khẩu không chính xác.' };
    }
    const user = toPublicUser(account);
    this.store.write({ currentUser: user, rememberSession: options?.remember ?? true });
    return { ok: true, user };
  }

  register(data: RegisterData): AuthResult {
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
    const { registeredUsers } = this.store.read();
    if ([...mockUsers, ...registeredUsers].some((account) => normalizeEmail(account.email) === email)) {
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
    this.store.write({
      registeredUsers: [...registeredUsers, account],
      currentUser: user,
      rememberSession: true,
    });
    this.notification.publish({
      kind: 'system',
      title: 'Tài khoản đã được tạo',
      message: `Chào ${fullName}, tài khoản sinh viên của bạn đã sẵn sàng.`,
    });
    return { ok: true, user };
  }

  logout(): void {
    this.store.write({ currentUser: null });
  }

  resetDemo(): void {
    this.store.write({ currentUser: null, registeredUsers: [] });
  }

  /* ------------------------------ ISetting ----------------------------- */

  settings(userId: string): UserSettings {
    return this.store.read().settings[userId] ?? { userId, ...DEFAULT_SETTINGS };
  }

  updateSettings(userId: string, patch: Partial<Omit<UserSettings, 'userId'>>) {
    const current = this.settings(userId);
    const next: UserSettings = { ...current, ...patch, userId };
    this.store.write({ settings: { ...this.store.read().settings, [userId]: next } });
    return { ok: true, message: 'Đã lưu thiết lập cá nhân.' };
  }
}
