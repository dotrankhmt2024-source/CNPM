import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('Appearance preferences', () => {
  async function setup(initial?: string) {
    const storage = new Map<string, string>();
    if (initial) storage.set('semh-ui-v1', initial);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal('window', { localStorage: globalThis.localStorage, matchMedia: () => ({ matches: true }) });
    const { useUiStore } = await import('../useUiStore');
    return { store: useUiStore, storage };
  }
  it('migrates the old dark preference without losing it', async () => {
    const { store } = await setup(JSON.stringify({ state: { dark: true }, version: 0 }));
    expect(store.getState().theme).toBe('dark');
    expect(store.getState().dark).toBe(true);
    expect(store.getState().language).toBe('vi');
  });
  it('follows system only in auto mode, persists language and resets appearance', async () => {
    const { store, storage } = await setup();
    store.getState().setTheme('system');
    expect(store.getState().dark).toBe(true);
    store.getState().syncSystemTheme(false);
    expect(store.getState().dark).toBe(false);
    store.getState().setTheme('dark');
    store.getState().syncSystemTheme(false);
    expect(store.getState().dark).toBe(true);
    store.getState().setLanguage('en');
    expect(JSON.parse(storage.get('semh-ui-v1')!).state.language).toBe('en');
    store.getState().resetAppearance();
    expect(store.getState()).toMatchObject({ theme: 'light', dark: false, language: 'vi' });
  });
});
