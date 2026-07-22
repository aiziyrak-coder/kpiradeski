'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from './ui';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { ChecklistItemMeta } from '@/types';

export function ChecklistForm({
  title,
  description,
  items,
  initial,
  percentage,
  onSave,
  saving,
}: {
  title: string;
  description?: string;
  items: ChecklistItemMeta[];
  initial?: Record<string, boolean>;
  percentage?: number;
  onSave: (values: Record<string, boolean>) => Promise<void>;
  saving?: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const base: Record<string, boolean> = {};
    items.forEach((i) => {
      base[i.key] = initial?.[i.key] ?? false;
    });
    setValues(base);
  }, [items, initial]);

  const done = items.filter((i) => values[i.key]).length;
  const livePct = items.length ? Math.round((done / items.length) * 1000) / 10 : 0;

  return (
    <div className="rounded-3xl border border-teal-100/80 bg-white/80 backdrop-blur p-5 sm:p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="font-display text-2xl text-ink">{title}</h3>
          {description && <p className="text-sm text-ink-muted mt-1">{description}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-semibold text-teal-700 tabular-nums">{livePct}%</p>
          <p className="text-xs text-ink-muted">
            {done}/{items.length}
            {percentage != null && percentage !== livePct
              ? t('checklist.savedPct', { pct: percentage })
              : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => {
          const checked = !!values[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setValues((v) => ({ ...v, [item.key]: !v[item.key] }))}
              className={cn(
                'w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all duration-200',
                checked
                  ? 'bg-teal-50/90 border-teal-200 shadow-sm'
                  : 'bg-sand-50/50 border-transparent hover:border-teal-100 hover:bg-white',
              )}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <span
                className={cn(
                  'mt-0.5 w-6 h-6 rounded-lg border-2 grid place-items-center shrink-0 transition',
                  checked ? 'bg-teal-700 border-teal-700 text-white' : 'border-teal-200 bg-white',
                )}
              >
                {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                <span className="block text-xs text-ink-muted mt-0.5">{item.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex justify-end">
        <Button disabled={saving} onClick={() => onSave(values)}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
