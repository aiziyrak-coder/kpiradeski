'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

export default function BranchesPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [branches, setBranches] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', address: '' });
  const [assign, setAssign] = useState({ branchId: '', userId: '' });

  async function load() {
    try {
      const [b, u] = await Promise.all([
        api<any[]>('/branches'),
        api<any[]>('/users'),
      ]);
      setBranches(b);
      setManagers(u.filter((x) => x.role === 'MANAGER' && x.active));
      if (!assign.branchId && b[0]) setAssign((a) => ({ ...a, branchId: b[0].id }));
      if (!assign.userId && managers[0]) {
        /* keep */
      }
    } catch (e: any) {
      toast.error(t('common.error'), e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/branches', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), address: form.address.trim() || undefined }),
      });
      setForm({ name: '', address: '' });
      toast.success(t('common.saved'));
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!assign.branchId || !assign.userId) return;
    try {
      await api(`/branches/${assign.branchId}/managers`, {
        method: 'POST',
        body: JSON.stringify({ userId: assign.userId }),
      });
      toast.success(t('common.saved'));
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function unassign(branchId: string, userId: string) {
    try {
      await api(`/branches/${branchId}/managers/${userId}`, { method: 'DELETE' });
      toast.success(t('common.deleted'));
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function toggleActive(b: any) {
    try {
      await api(`/branches/${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !b.active, name: b.name }),
      });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'SUPER_ADMIN']}>
        <SectionHeader
          title="Filiallar"
        />

        <div className="grid lg:grid-cols-2 gap-5 mb-8">
          <form
            onSubmit={onCreate}
            className="rounded-3xl border border-teal-100 bg-white/90 p-5 shadow-soft space-y-3"
          >
            <h3 className="font-display text-2xl">Yangi filial</h3>
            <Input
              label="Nomi"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label="Manzil"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="h-12"
            />
            <Button type="submit" className="w-full min-h-12">
              Qoʻshish
            </Button>
          </form>

          <form
            onSubmit={onAssign}
            className="rounded-3xl border border-teal-100 bg-white/90 p-5 shadow-soft space-y-3"
          >
            <h3 className="font-display text-2xl">Manager biriktirish</h3>
            <Select
              label="Filial"
              value={assign.branchId}
              onChange={(e) => setAssign({ ...assign, branchId: e.target.value })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select
              label="Manager"
              value={assign.userId}
              onChange={(e) => setAssign({ ...assign, userId: e.target.value })}
            >
              <option value="">Tanlang...</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.email}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-full min-h-12" disabled={!assign.userId}>
              Biriktirish
            </Button>
          </form>
        </div>

        <div className="space-y-3">
          {branches.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft"
            >
              <div className="flex flex-wrap justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-ink">{b.name}</p>
                  {b.address && <p className="text-xs text-ink-muted">{b.address}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(b)}
                  className={
                    b.active
                      ? 'text-xs font-semibold text-teal-700'
                      : 'text-xs font-semibold text-rose-600'
                  }
                >
                  {b.active ? 'Faol' : 'Nofaol'}
                </button>
              </div>
              <p className="text-xs text-ink-muted mb-2">Managerlar:</p>
              <div className="flex flex-wrap gap-2">
                {(b.managers || []).length === 0 && (
                  <span className="text-sm text-ink-muted">Biriktirilmagan</span>
                )}
                {(b.managers || []).map((m: any) => (
                  <span
                    key={m.userId}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-50 text-sm border border-teal-100"
                  >
                    {m.user?.name}
                    <button
                      type="button"
                      className="text-rose-600 text-xs"
                      onClick={() => unassign(b.id, m.userId)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </RoleGate>
    </AppShell>
  );
}
