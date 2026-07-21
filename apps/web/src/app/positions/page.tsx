'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { Position } from '@/types';

export default function PositionsPage() {
  const toast = useToast();
  const { t, positionName } = useI18n();
  const [rows, setRows] = useState<Position[]>([]);
  const [form, setForm] = useState({
    nameUz: '',
    nameRu: '',
    code: '',
    sortOrder: 0,
    active: true,
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    nameUz: '',
    nameRu: '',
    code: '',
    sortOrder: 0,
    active: true,
  });

  async function load() {
    try {
      setRows(await api<Position[]>('/positions'));
    } catch (e: any) {
      toast.error(t('common.error'), e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.nameUz.trim() || !form.nameRu.trim()) {
      toast.error(t('positions.requiredNames'));
      return;
    }
    try {
      await api('/positions', {
        method: 'POST',
        body: JSON.stringify({
          nameUz: form.nameUz.trim(),
          nameRu: form.nameRu.trim(),
          code: form.code.trim() || undefined,
          sortOrder: form.sortOrder,
          active: form.active,
        }),
      });
      setForm({ nameUz: '', nameRu: '', code: '', sortOrder: 0, active: true });
      toast.success(t('positions.created'));
      await load();
    } catch (err: any) {
      toast.error(t('common.error'), err.message);
    }
  }

  function startEdit(p: Position) {
    setEditId(p.id);
    setEdit({
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      code: p.code,
      sortOrder: p.sortOrder ?? 0,
      active: p.active ?? true,
    });
  }

  async function saveEdit(id: string) {
    try {
      await api(`/positions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameUz: edit.nameUz.trim(),
          nameRu: edit.nameRu.trim(),
          code: edit.code.trim() || undefined,
          sortOrder: edit.sortOrder,
          active: edit.active,
        }),
      });
      toast.success(t('positions.updated'));
      setEditId(null);
      await load();
    } catch (e: any) {
      toast.error(t('common.error'), e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await api(`/positions/${id}/delete`, { method: 'POST' });
      toast.success(t('positions.deleted'));
      await load();
    } catch (e: any) {
      toast.error(t('positions.deleteFailed'), e.message);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['SUPER_ADMIN', 'MANAGER']}>
        <SectionHeader
          eyebrow={t('positions.eyebrow')}
          title={t('positions.title')}
          description={t('positions.description')}
        />

        <div className="grid lg:grid-cols-5 gap-5">
          <form
            onSubmit={onCreate}
            className="lg:col-span-2 rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3"
          >
            <h3 className="font-display text-2xl">{t('positions.new')}</h3>
            <Input
              label={t('common.nameUz')}
              value={form.nameUz}
              onChange={(e) => setForm({ ...form, nameUz: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label={t('common.nameRu')}
              value={form.nameRu}
              onChange={(e) => setForm({ ...form, nameRu: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label={t('common.code')}
              placeholder={t('positions.codeHint')}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="h-12"
            />
            <Input
              label={t('common.sortOrder')}
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className="h-12"
            />
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-teal-200"
              />
              {t('common.active')}
            </label>
            <Button type="submit" className="w-full min-h-12">
              {t('common.add')}
            </Button>
          </form>

          <div className="lg:col-span-3 space-y-3">
            <h3 className="font-display text-xl text-ink">{t('positions.list')}</h3>
            {rows.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3"
              >
                {editId === p.id ? (
                  <div className="space-y-3">
                    <Input
                      label={t('common.nameUz')}
                      value={edit.nameUz}
                      onChange={(e) => setEdit({ ...edit, nameUz: e.target.value })}
                      className="h-11"
                    />
                    <Input
                      label={t('common.nameRu')}
                      value={edit.nameRu}
                      onChange={(e) => setEdit({ ...edit, nameRu: e.target.value })}
                      className="h-11"
                    />
                    <Input
                      label={t('common.code')}
                      value={edit.code}
                      onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                      className="h-11"
                    />
                    <Input
                      label={t('common.sortOrder')}
                      type="number"
                      value={edit.sortOrder}
                      onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })}
                      className="h-11"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={edit.active}
                        onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
                      />
                      {t('common.active')}
                    </label>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => saveEdit(p.id)}>
                        {t('common.save')}
                      </Button>
                      <Button variant="secondary" onClick={() => setEditId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{positionName(p)}</p>
                        <p className="text-xs text-ink-muted">
                          {t('common.code')}: {p.code} · {t('common.sortOrder')}: {p.sortOrder ?? 0}
                        </p>
                        <p className="text-xs text-teal-800 mt-1">
                          UZ: {p.nameUz} · RU: {p.nameRu}
                        </p>
                      </div>
                      <span
                        className={
                          p.active
                            ? 'text-xs font-semibold text-teal-700'
                            : 'text-xs font-semibold text-rose-600'
                        }
                      >
                        {p.active ? t('common.active') : t('common.inactive')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>
                        {t('common.edit')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-center text-ink-muted text-sm py-8">{t('positions.empty')}</p>
            )}
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
