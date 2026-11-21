/**
 * AccountStore — bảng dữ liệu tài khoản của DataStore (tách khỏi dữ liệu vận hành).
 *
 * Giữ nguyên khoá localStorage cũ để các tài khoản đã đăng ký trong bản demo
 * trước đây vẫn còn sau khi tái cấu trúc.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AccountState, IAccountStore } from '@/contracts/AccessIdentity';

const emptyState: AccountState = {
  currentUser: null,
  registeredUsers: [],
  rememberSession: true,
  settings: {},
};

export const accountStore = create<AccountState>()(
  persist(() => ({ ...emptyState }), {
    name: 'smart-hub-auth-demo-v1',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      // Không ghi nhớ đăng nhập thì chỉ giữ phiên trong bộ nhớ, refresh là mất.
      currentUser: state.rememberSession ? state.currentUser : null,
      registeredUsers: state.registeredUsers,
      rememberSession: state.rememberSession,
      settings: state.settings,
    }),
  }),
);

export class AccountDataSource implements IAccountStore {
  read(): AccountState {
    return accountStore.getState();
  }

  write(patch: Partial<AccountState>): void {
    accountStore.setState(patch);
  }

  subscribe(listener: (state: AccountState) => void): () => void {
    return accountStore.subscribe((state) => listener(state));
  }
}
