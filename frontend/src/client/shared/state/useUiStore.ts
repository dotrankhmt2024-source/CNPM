import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiStore = {
  dark: boolean;
  theme: 'light' | 'dark' | 'system';
  language: 'vi' | 'en';
  setTheme: (theme: UiStore['theme']) => void;
  setLanguage: (language: UiStore['language']) => void;
  syncSystemTheme: (dark: boolean) => void;
  resetAppearance: () => void;
  toggleDark: () => void;
};

/** Trạng thái giao diện (sáng/tối) dùng chung giữa AppShell và menu tài khoản. */
export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      dark: false,
      theme: 'light',
      language: 'vi',
      setTheme: (theme) => set({ theme, dark: theme === 'system' ? systemDark() : theme === 'dark' }),
      setLanguage: (language) => set({ language }),
      syncSystemTheme: (dark) => set((state) => state.theme === 'system' ? { dark } : {}),
      resetAppearance: () => set({ theme: 'light', language: 'vi', dark: false }),
      toggleDark: () => set((state) => ({ dark: !state.dark, theme: state.dark ? 'light' : 'dark' })),
    }),
    { name: 'semh-ui-v1', version: 1,
      migrate: (persisted) => {
        const old = persisted as Partial<UiStore>;
        return { dark: old.dark === true, theme: old.dark ? 'dark' : 'light', language: 'vi' };
      },
    },
  ),
);

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
