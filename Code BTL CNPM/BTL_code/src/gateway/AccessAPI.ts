/**
 * AccessAPI — cổng của subsystem Access & Identify cho cả hai client
 * (đăng nhập/đăng ký/phiên, thiết lập cá nhân, thông báo).
 */
import type { AuthResult, LoginCredentials, RegisterData, User } from '@/shared/types/auth';
import type { OperationResult } from '@/contracts/common';
import type { AccessAPI } from '@/contracts/Gateway';
import type { AppNotification, AccountState, UserSettings } from '@/contracts/AccessIdentity';
import type { GatewayDeps } from './APIGateway';

export class AccessAPIImpl implements AccessAPI {
  constructor(private readonly deps: GatewayDeps) {}

  currentUser(): User | null {
    return this.deps.auth.currentUser();
  }

  login(credentials: LoginCredentials, options?: { remember?: boolean }): AuthResult {
    return this.deps.auth.login(credentials, options);
  }

  register(data: RegisterData): AuthResult {
    return this.deps.auth.register(data);
  }

  logout(): void {
    this.deps.auth.logout();
  }

  resetDemo(): void {
    this.deps.auth.resetDemo();
  }

  settings(userId: string): UserSettings {
    return this.deps.settings.settings(userId);
  }

  updateSettings(userId: string, patch: Partial<Omit<UserSettings, 'userId'>>): OperationResult {
    return this.deps.settings.updateSettings(userId, patch);
  }

  notifications(): AppNotification[] {
    return this.deps.notification.list();
  }

  markNotificationsRead(): void {
    this.deps.notification.markAllRead();
  }

  sessionSnapshot(): AccountState {
    return this.deps.accounts.read();
  }

  subscribeSession(listener: (state: AccountState) => void): () => void {
    return this.deps.accounts.subscribe(listener);
  }
}
