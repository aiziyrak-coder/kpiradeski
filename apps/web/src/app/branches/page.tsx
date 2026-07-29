'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  active: boolean;
  managers?: Array<{ userId: string; user?: { name?: string } }>;
};

export default function BranchesPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', address: '' });
  const [assign, setAssign] = useState({ branchId: '', userId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [b, u] = await Promise.all([
        api<Branch[]>('/branches'),
        api<any[]>('/users'),
      ]);
      setBranches(b);
      setManagers(u.filter((x) => x.role === 'MANAGER' && x.active));
      if (!assign.branchId && b[0]) setAssign((a) => ({ ...a, branchId: b[0].id }));
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
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || undefined,
        }),
      });
      setForm({ name: '', address: '' });
      toast.success(t('common.saved'));
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setEditForm({ name: b.name || '', address: b.address || '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', address: '' });
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const name = editForm.name.trim();
    if (!name) {
      toast.error(t('branches.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await api(`/branches/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          address: editForm.address.trim(),
        }),
      });
      toast.success(t('common.saved'));
      cancelEdit();
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
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

  async function toggleActive(b: Branch) {
    try {
      await api(`/branches/${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !b.active }),
      });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'SUPER_ADMIN']}>
        <SectionHeader title={t('branches.title')} />

        <div className="grid lg:grid-cols-2 gap-5 mb-8">
          <form
            onSubmit={onCreate}
            className="rounded-3xl border border-teal-100 bg-white/90 p-5 shadow-soft space-y-3"
          >
            <h3 className="font-display text-2xl">{t('branches.newBranch')}</h3>
            <Input
              label={t('branches.name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label={t('branches.address')}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="h-12"
            />
            <Button type="submit" className="w-full min-h-12">
              {t('common.add')}
            </Button>
          </form>

          <form
            onSubmit={onAssign}
            className="rounded-3xl border border-teal-100 bg-white/90 p-5 shadow-soft space-y-3"
          >
            <h3 className="font-display text-2xl">{t('branches.assign')}</h3>
            <Select
              label={t('branches.branch')}
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
              label={t('branches.manager')}
              value={assign.userId}
              onChange={(e) => setAssign({ ...assign, userId: e.target.value })}
            >
              <option value="">{t('branches.select')}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.email}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-full min-h-12" disabled={!assign.userId}>
              {t('branches.assignBtn')}
            </Button>
          </form>
        </div>

        <div className="space-y-3">
          {branches.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft"
            >
              {editingId === b.id ? (
                <form onSubmit={onSaveEdit} className="space-y-3 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-teal-900">{t('branches.editBranch')}</p>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1.5 rounded-lg text-ink-muted hover:bg-teal-50"
                      aria-label={t('common.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <Input
                    label={t('branches.name')}
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    className="h-11"
                  />
                  <Input
                    label={t('branches.address')}
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="h-11"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving} className="min-h-10 flex-1">
                      {saving ? t('common.saving') : t('common.save')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={cancelEdit}
                      className="min-h-10"
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{b.name}</p>
                    {b.address ? (
                      <p className="text-xs text-ink-muted">{b.address}</p>
                    ) : (
                      <p className="text-xs text-ink-muted italic">{t('branches.noAddress')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-200 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(b)}
                      className={
                        b.active
                          ? 'text-xs font-semibold text-teal-700 px-2'
                          : 'text-xs font-semibold text-rose-600 px-2'
                      }
                    >
                      {b.active ? t('common.active') : t('common.inactive')}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-muted mb-2">{t('branches.managers')}:</p>
              <div className="flex flex-wrap gap-2">
                {(b.managers || []).length === 0 && (
                  <span className="text-sm text-ink-muted">{t('branches.unassigned')}</span>
                )}
                {(b.managers || []).map((m) => (
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
