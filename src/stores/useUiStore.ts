import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiStore = {
  dark: boolean;
  toggleDark: () => void;
};

/** Trạng thái giao diện (sáng/tối) dùng chung giữa AppShell và menu tài khoản. */
export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      dark: false,
      toggleDark: () => set((state) => ({ dark: !state.dark })),
    }),
    { name: 'semh-ui-v1' },
  ),
);
