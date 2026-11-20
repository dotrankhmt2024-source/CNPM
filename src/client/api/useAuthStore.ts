/**
 * useAuthStore — store phía Client cho phiên đăng nhập.
 *
 * Dữ liệu (người dùng hiện tại, tài khoản đã đăng ký, thiết lập) đọc từ bảng tài khoản
 * của DataStore; mọi thao tác đi qua AccessAPI của APIGateway.
 */
import { create } from 'zustand';
import { apiGateway } from '@/gateway';
import type { AccountState } from '@/contracts/AccessIdentity';
import type { AuthResult, LoginCredentials, RegisterData } from '@/shared/types/auth';

export interface AuthCommands {
  login: (credentials: LoginCredentials, options?: { remember?: boolean }) => AuthResult;
  register: (data: RegisterData) => AuthResult;
  logout: () => void;
  resetAuthDemo: () => void;
}

export type AuthStoreState = AccountState & AuthCommands;

const commands: AuthCommands = {
  login: (credentials, options) => apiGateway.access.login(credentials, options),
  register: (data) => apiGateway.access.register(data),
  logout: () => apiGateway.access.logout(),
  resetAuthDemo: () => apiGateway.access.resetDemo(),
};

const useClientAuthStore = create<AuthStoreState>()(() => ({
  ...apiGateway.access.sessionSnapshot(),
  ...commands,
}));

apiGateway.access.subscribeSession((state) => useClientAuthStore.setState(state));
useClientAuthStore.setState(apiGateway.access.sessionSnapshot());

const selectAll = (state: AuthStoreState) => state;

export function useAuthStore(): AuthStoreState;
export function useAuthStore<T>(selector: (state: AuthStoreState) => T): T;
export function useAuthStore<T>(selector?: (state: AuthStoreState) => T): AuthStoreState | T {
  const select = (selector ?? selectAll) as (state: AuthStoreState) => AuthStoreState | T;
  return useClientAuthStore(select);
}
