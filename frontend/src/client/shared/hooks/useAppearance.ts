import { useEffect } from 'react';
import { useUiStore } from '../state/useUiStore';

export function useAppearance() {
  const { dark, language, theme, syncSystemTheme } = useUiStore();
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => syncSystemTheme(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme, syncSystemTheme]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.documentElement.lang = language;
  }, [dark, language]);
}
