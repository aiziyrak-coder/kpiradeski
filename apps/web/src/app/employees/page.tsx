'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { AuthPhoto } from '@/components/AuthPhoto';
import { compressImageFile } from '@/lib/image-compress';

const emptyForm = () => ({
  firstName: '',
  lastName: '',
  position: '',
  expectedArrive: '08:00',
  expectedLeave: '18:00',
  workDays: '1,2,3,4,5,6',
  photo: null as File | null,
});

export default function EmployeesPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [branches, setBranches] = useState<any[]>([]);
  const [branchId, setBranchId] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [preview, setPreview] = useState<string | null>(null);
  const [photoTick, setPhotoTick] = useState(0);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const b = await api<any[]>('/branches/mine');
      const active = (b || []).filter((x) => x.active !== false);
      setBranches(active);
      const bid = branchId || active[0]?.id || '';
      if (!branchId && bid) setBranchId(bid);
      if (!bid) {
        setList([]);
        return;
      }
      setList(await api(`/attendance/employees?branchId=${bid}`));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  function clearPreview() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  function startCreate() {
    setEditId(null);
    setForm(emptyForm());
    clearPreview();
  }

  function startEdit(e: any) {
    setEditId(e.id);
    setForm({
      firstName: e.firstName || '',
      lastName: e.lastName || '',
      position: e.position || '',
      expectedArrive: e.expectedArrive || '08:00',
      expectedLeave: e.expectedLeave || '18:00',
      workDays: e.workDays || '1,2,3,4,5,6',
      photo: null,
    });
    clearPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onPhoto(f: File | null) {
    clearPreview();
    if (!f) {
      setForm((s) => ({ ...s, photo: null }));
      return;
    }
    try {
      const jpg = await compressImageFile(f);
      setForm((s) => ({ ...s, photo: jpg }));
      if (jpg.type.startsWith('image/') && !/heic|heif/i.test(jpg.type)) {
        setPreview(URL.createObjectURL(jpg));
      }
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
      setForm((s) => ({ ...s, photo: null }));
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!branchId) return;
    setBusy(true);
    try {
      let photoFile = form.photo;
      if (photoFile) {
        photoFile = await compressImageFile(photoFile);
      }
      const fd = new FormData();
      fd.append('firstName', form.firstName.trim());
      fd.append('lastName', form.lastName.trim());
      fd.append('expectedArrive', form.expectedArrive);
      fd.append('expectedLeave', form.expectedLeave);
      fd.append('workDays', form.workDays);
      fd.append('position', form.position.trim());
      if (photoFile) fd.append('photo', photoFile, photoFile.name || 'photo.jpg');

      const token = getToken();
      let res: Response;
      if (editId) {
        res = await fetch(`/api/attendance/employees/${editId}`, {
          method: 'PATCH',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
      } else {
        fd.append('branchId', branchId);
        res = await fetch('/api/attendance/employees', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message || t('common.error');
        throw new Error(msg);
      }
      toast.success(editId ? t('employees.updated') : t('employees.created'));
      startCreate();
      setPhotoTick((n) => n + 1);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(e: any) {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      const fd = new FormData();
      fd.append('active', String(!e.active));
      const token = getToken();
      const res = await fetch(`/api/attendance/employees/${e.id}`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('common.error'));
      if (editId === e.id) startCreate();
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const editing = !!editId;
  const editingEmp = editing ? list.find((x) => x.id === editId) : null;

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'SUPER_ADMIN']}>
        <SectionHeader title={t('employees.title')} />
        <p className="text-sm text-ink-muted -mt-3 mb-5">{t('employees.hint')}</p>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="max-w-sm flex-1 min-w-[200px]">
            <Select
              label={t('branches.branch')}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                startCreate();
              }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={startCreate}>
            {t('employees.newBtn')}
          </Button>
        </div>

        <div className="grid lg:grid-cols-5 gap-5">
          <form
            onSubmit={onSubmit}
            className="lg:col-span-2 rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                {editing ? t('employees.editTitle') : t('employees.new')}
              </p>
              {editing && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="text-xs text-ink-muted underline"
                >
                  {t('employees.cancelEdit')}
                </button>
              )}
            </div>

            <Input
              label={t('employees.lastName')}
              value={form.lastName}
              onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))}
              required
            />
            <Input
              label={t('employees.firstName')}
              value={form.firstName}
              onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))}
              required
            />
            <Input
              label={t('employees.position')}
              value={form.position}
              onChange={(e) => setForm((s) => ({ ...s, position: e.target.value }))}
              placeholder="Shifokor / Registrator…"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label={t('employees.expected')}
                type="time"
                value={form.expectedArrive}
                onChange={(e) => setForm((s) => ({ ...s, expectedArrive: e.target.value }))}
                required
              />
              <Input
                label={t('employees.leave')}
                type="time"
                value={form.expectedLeave}
                onChange={(e) => setForm((s) => ({ ...s, expectedLeave: e.target.value }))}
                required
              />
            </div>
            <Select
              label={t('employees.workDays')}
              value={form.workDays}
              onChange={(e) => setForm((s) => ({ ...s, workDays: e.target.value }))}
            >
              <option value="1,2,3,4,5,6">{t('employees.monSat')}</option>
              <option value="1,2,3,4,5">{t('employees.monFri')}</option>
            </Select>

            <div className="space-y-2">
              <span className="text-sm font-medium text-ink-soft">{t('employees.photo')}</span>
              <div className="flex items-center gap-3">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt=""
                    className="w-20 h-20 object-cover rounded-xl border"
                  />
                ) : editing && editingEmp?.hasPhoto ? (
                  <AuthPhoto
                    key={editId}
                    src={`/api/attendance/employees/${editId}/photo?t=${photoTick}`}
                    alt={editingEmp.name}
                    className="w-20 h-20 rounded-xl object-cover bg-sand-100"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-sand-100 grid place-items-center text-[10px] text-ink-muted text-center px-1">
                    {t('employees.noPhoto')}
                  </div>
                )}
                <label className="text-sm text-teal-800 underline cursor-pointer">
                  {t('employees.choosePhoto')}
                  <input
                    type="file"
                    accept="image/*,.heic,.heif,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => onPhoto(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <p className="text-[11px] text-ink-muted">{t('employees.graceHint')}</p>
            <Button type="submit" disabled={busy}>
              {busy
                ? t('common.saving')
                : editing
                  ? t('employees.saveEdit')
                  : t('employees.create')}
            </Button>
          </form>

          <div className="lg:col-span-3 space-y-2">
            {list.map((e) => (
              <div
                key={e.id}
                className={`flex items-start gap-3 rounded-2xl border bg-white p-3 ${
                  editId === e.id ? 'border-teal-500 ring-1 ring-teal-200' : 'border-teal-100'
                }`}
              >
                <div className="shrink-0">
                  {e.hasPhoto ? (
                    <AuthPhoto
                      src={`/api/attendance/employees/${e.id}/photo?t=${photoTick}`}
                      alt={e.name}
                      className="w-14 h-14 rounded-xl object-cover bg-sand-100"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-sand-100 grid place-items-center text-[10px] text-ink-muted text-center px-1">
                      {t('employees.noPhoto')}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium leading-snug">{e.name}</p>
                  {e.position && <p className="text-xs text-ink-muted">{e.position}</p>}
                  <p className="text-[11px] text-teal-900">{e.scheduleLabel}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    className="text-xs font-semibold text-teal-800 underline"
                  >
                    {t('employees.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(e)}
                    className="text-xs text-ink-muted underline"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
            {!list.length && (
              <p className="text-sm text-ink-muted py-10 text-center border border-dashed rounded-2xl">
                {t('employees.emptyBranch')}
              </p>
            )}
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
