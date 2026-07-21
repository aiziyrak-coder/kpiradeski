'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { type Role } from '@/types';

/** Faqat Admin va Manager */
const APP_ROLES: Role[] = ['ADMIN', 'MANAGER'];

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { t, roleLabel } = useI18n();
  const isSA = me?.role === 'SUPER_ADMIN';
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'MANAGER' as Role,
    phone: '',
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    name: '',
    role: 'MANAGER' as Role,
    phone: '',
    password: '',
  });

  const roleOptions = APP_ROLES.filter((r) => {
    if (isSA) return true;
    return r !== 'SUPER_ADMIN';
  });

  async function load() {
    try {
      setUsers(await api<any[]>('/users'));
    } catch (e: any) {
      toast.error(t('users.loadFailed'), e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = users.filter((u) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      u.name?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s) ||
      roleLabel(u.role)?.toLowerCase().includes(s)
    );
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error(t('users.passwordMin'));
      return;
    }
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          phone: form.phone || undefined,
        }),
      });
      setForm({ name: '', email: '', password: '', role: 'MANAGER', phone: '' });
      toast.success(t('users.created'));
      await load();
    } catch (err: any) {
      toast.error(t('users.createFailed'), err.message);
    }
  }

  function startEdit(u: any) {
    setEditId(u.id);
    setEdit({
      name: u.name,
      role: u.role,
      phone: u.phone || '',
      password: '',
    });
  }

  async function saveEdit(id: string) {
    try {
      await api(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name,
          role: edit.role,
          phone: edit.phone || undefined,
          ...(edit.password ? { password: edit.password } : {}),
        }),
      });
      toast.success(edit.password ? t('users.updatedPassword') : t('users.updated'));
      setEditId(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function toggleActive(u: any) {
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !u.active }),
      });
      toast.success(u.active ? t('users.deactivated') : t('users.activated'));
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['SUPER_ADMIN', 'ADMIN']}>
        <SectionHeader
          eyebrow={t('users.eyebrow')}
          title={t('users.title')}
          description="Admin va Manager yaratish. Manager filialga /branches orqali biriktiriladi."
        />

        <div className="mb-4">
          <Input
            label={t('common.search')}
            placeholder={t('users.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12"
          />
        </div>

        <div className="grid lg:grid-cols-5 gap-5">
          <form
            onSubmit={onSubmit}
            className="lg:col-span-2 rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3"
          >
            <h3 className="font-display text-2xl">{t('users.newUser')}</h3>
            <Input
              label={t('users.name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label={t('login.email')}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label={t('users.phone')}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="h-12"
            />
            <Input
              label={t('users.password')}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
              className="h-12"
            />
            <Select
              label={t('users.role')}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-full min-h-12">
              {t('users.create')}
            </Button>
          </form>

          <div className="lg:col-span-3 space-y-3">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-soft space-y-3"
              >
                {editId === u.id ? (
                  <div className="space-y-3">
                    <Input
                      label={t('users.name')}
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="h-11"
                    />
                    <Select
                      label={t('users.role')}
                      value={edit.role}
                      onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}
                      disabled={u.id === me?.id}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label={t('users.phone')}
                      value={edit.phone}
                      onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                      className="h-11"
                    />
                    <Input
                      label={t('users.newPassword')}
                      type="password"
                      value={edit.password}
                      onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                      minLength={8}
                      className="h-11"
                    />
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => saveEdit(u.id)}>
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
                        <p className="font-semibold text-ink">{u.name}</p>
                        <p className="text-xs text-ink-muted">{u.email}</p>
                        {u.phone && <p className="text-xs text-ink-muted">{u.phone}</p>}
                      </div>
                      <span
                        className={
                          u.active
                            ? 'text-xs font-semibold text-teal-700'
                            : 'text-xs font-semibold text-rose-600'
                        }
                      >
                        {u.active ? t('common.active') : t('users.deleted')}
                      </span>
                    </div>
                    <p className="text-sm text-teal-800">{roleLabel(u.role)}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(u)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(u)}
                        disabled={u.id === me?.id}
                      >
                        {u.active ? t('common.delete') : t('common.activate')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-ink-muted text-sm py-8">{t('users.notFound')}</p>
            )}
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
