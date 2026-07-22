'use client';

import { cn } from '@/lib/utils';
import { useI18n, type Lang } from '@/lib/i18n';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();

  const btn = (code: Lang, label: string) => (
    <button
      key={code}
      type="button"
      onClick={() => setLang(code)}
      className={cn(
        'px-2.5 py-1 rounded-lg text-xs font-semibold transition',
        lang === code
          ? 'bg-teal-700 text-white'
          : 'text-ink-muted hover:bg-teal-50 hover:text-teal-800',
      )}
      aria-pressed={lang === code}
    >
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-xl border border-teal-100 bg-white/80',
        className,
      )}
      role="group"
      aria-label={t('common.language')}
    >
      {btn('uz', 'UZ')}
      {btn('ru', 'RU')}
    </div>
  );
}
