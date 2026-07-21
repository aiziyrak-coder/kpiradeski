'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { formatTashkent, ROLE_LABELS, type Role } from '@/types';
import { cn } from '@/lib/utils';

const ACTION_UZ: Record<string, string> = {
  user_create: 'Foydalanuvchi yaratildi',
  user_update: 'Foydalanuvchi yangilandi',
  user_password_reset: 'Parol reset',
  password_change: 'Parol oʻzgardi',
  link_telegram: 'Telegram bogʻlandi',
};

export default function AuditPage() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openMeta, setOpenMeta] = useState<string | null>(null);

  async function load(p = page) {
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '40',
      });
      if (q.trim()) params.set('q', q.trim());
      if (action.trim()) params.set('action', action.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      setData(await api(`/audit?${params}`));
    } catch (e: any) {
      toast.error('Audit yuklanmadi', e.message);
    }
  }

  useEffect(() => {
    load(page);
  }, [page]);

  function applyFilters() {
    setPage(1);
    load(1);
  }

  return (
    <AppShell>
      <RoleGate allow={['MANAGER', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Xavfsizlik"
          title="Audit jurnal"
          description="Kim nima qilgani — o‘chirib bo‘lmaydigan tarix. Qidiruv va sana filtri."
        />

        <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input label="Qidiruv" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism, amal..." />
          <Input label="Amal" value={action} onChange={(e) => setAction(e.target.value)} placeholder="user_create..." />
          <Input label="Dan" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Gacha" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="flex items-end">
            <Button className="w-full min-h-11" onClick={applyFilters}>
              Filtrlash
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {(data?.items || []).length === 0 && (
            <div className="rounded-3xl border border-dashed border-teal-200 p-10 text-center text-ink-muted">
              Yozuv topilmadi
            </div>
          )}
          {(data?.items || []).map((a: any) => (
            <article
              key={a.id}
              className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {ACTION_UZ[a.action] || a.action}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {a.user?.name || '—'}
                    {a.user?.role ? ` · ${ROLE_LABELS[a.user.role as Role] || a.user.role}` : ''}
                  </p>
                </div>
                <p className="text-xs text-ink-muted whitespace-nowrap">{formatTashkent(a.createdAt)}</p>
              </div>
              <p className="text-xs text-teal-800 mt-2">
                {a.entity}
                {a.entityId ? ` · ${String(a.entityId).slice(0, 12)}…` : ''}
              </p>
              {a.meta && (
                <button
                  type="button"
                  className="text-xs text-teal-700 underline mt-2"
                  onClick={() => setOpenMeta(openMeta === a.id ? null : a.id)}
                >
                  {openMeta === a.id ? 'Meta yopish' : 'Meta koʻrish'}
                </button>
              )}
              {openMeta === a.id && a.meta && (
                <pre
                  className={cn(
                    'mt-2 text-[11px] bg-sand-50 rounded-xl p-3 overflow-x-auto text-ink-soft',
                  )}
                >
                  {JSON.stringify(a.meta, null, 2)}
                </pre>
              )}
            </article>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-ink-muted">Jami: {data?.total ?? 0}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Oldingi
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= (data?.pages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
