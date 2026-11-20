/**
 * Hợp đồng của subsystem Access & Identify.
 *
 * AccountService cung cấp IAuth (đăng ký / đăng nhập / phiên) và ISetting (cá nhân hoá).
 * NotificationService cung cấp INotification để các subsystem khác gửi thông báo mà
 * không cần biết thông báo được hiển thị ở đâu.
 */
import type { AuthResult, LoginCredentials, MockAccount, RegisterData, User } from '@/shared/types/auth';
import type { OperationResult } from './common';

/** Dữ liệu tài khoản do DataStore quản lý. */
export interface AccountState {
  currentUser: User | null;
  registeredUsers: MockAccount[];
  rememberSession: boolean;
  settings: Record<string, UserSettings>;
}

/** Cổng truy cập bảng tài khoản (DataStore cài đặt). */
export interface IAccountStore {
  read(): AccountState;
  write(patch: Partial<AccountState>): void;
  subscribe(listener: (state: AccountState) => void): () => void;
}

export interface IAuth {
  currentUser(): User | null;
  login(credentials: LoginCredentials, options?: { remember?: boolean }): AuthResult;
  register(data: RegisterData): AuthResult;
  logout(): void;
  /** Xoá phiên và toàn bộ tài khoản tự đăng ký (dùng cho bản demo). */
  resetDemo(): void;
}

export interface UserSettings {
  userId: string;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark';
}

export interface ISetting {
  settings(userId: string): UserSettings;
  updateSettings(userId: string, patch: Partial<Omit<UserSettings, 'userId'>>): OperationResult;
}

export type NotificationKind = 'booking' | 'charging' | 'dispatch' | 'redirection' | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface INotification {
  publish(input: { kind: NotificationKind; title: string; message: string }): AppNotification;
  list(): AppNotification[];
  subscribe(listener: (items: AppNotification[]) => void): () => void;
  markAllRead(): void;
  clear(): void;
}
