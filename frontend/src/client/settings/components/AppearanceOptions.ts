import { createElement as h } from 'react';
import { useUiStore } from '../../shared/state/useUiStore';
import { useTranslation } from '../../shared/i18n';

export function AppearanceOptions() {
  const { theme, setTheme, language, setLanguage, resetAppearance } = useUiStore();
  const t = useTranslation();
  return h('div', { className: 'mt-5 space-y-4 border-t pt-4 dark:border-slate-700' },
    h('label', { className: 'flex items-center gap-3' },
      h('input', { type: 'checkbox', checked: theme === 'system', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTheme(e.target.checked ? 'system' : 'light') }),
      t('Tự động theo hệ điều hành', 'Follow system appearance')),
    h('label', { className: 'flex flex-wrap items-center gap-3' }, t('Ngôn ngữ', 'Language'),
      h('select', { value: language, className: 'rounded border p-2 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100',
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setLanguage(e.target.value as 'vi' | 'en') },
        h('option', { value: 'vi' }, 'Tiếng Việt'), h('option', { value: 'en' }, 'English'))),
    h('p', { className: 'muted-13' }, t('Lựa chọn được lưu trên trình duyệt này.', 'Preferences are saved in this browser.')),
    h('button', { type: 'button', className: 'rounded border px-4 py-2', onClick: resetAppearance },
      t('Đặt giao diện về mặc định', 'Reset appearance to defaults')));
}
