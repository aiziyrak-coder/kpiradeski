'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { ROLE_LABELS, POSITION_LABELS, type Role, type StaffPosition } from '@/types';

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const isSA = me?.role === 'SUPER_ADMIN';
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF' as Role,
    position: 'RECEPTION' as StaffPosition | '',
    phone: '',
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    name: '',
    role: 'STAFF' as Role,
    position: '' as StaffPosition | '',
    phone: '',
    password: '',
  });

  const roleOptions = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => {
    if (isSA) return true;
    return r !== 'SUPER_ADMIN';
  });

  async function load() {
    try {
      setUsers(await api('/users'));
    } catch (e: any) {
      toast.error('Yuklanmadi', e.message);
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
      ROLE_LABELS[u.role as Role]?.toLowerCase().includes(s)
    );
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error('Parol kamida 8 belgi');
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
          position: form.position || undefined,
          phone: form.phone || undefined,
        }),
      });
      setForm({ name: '', email: '', password: '', role: 'STAFF', position: 'RECEPTION', phone: '' });
      toast.success('Foydalanuvchi yaratildi');
      await load();
    } catch (err: any) {
      toast.error('Yaratilmadi', err.message);
    }
  }

  function startEdit(u: any) {
    setEditId(u.id);
    setEdit({
      name: u.name,
      role: u.role,
      position: u.position || '',
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
          position: edit.position || null,
          phone: edit.phone || undefined,
          ...(edit.password ? { password: edit.password } : {}),
        }),
      });
      toast.success(edit.password ? 'Yangilandi · parol reset' : 'Yangilandi');
      setEditId(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function setPosition(u: any, position: string) {
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: position || null }),
      });
      toast.success('Lavozim yangilandi');
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
      toast.success(u.active ? 'Oʻchirildi' : 'Faollashtirildi');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AppShell>
      <RoleGate allow={['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'DIRECTOR']}>
        <SectionHeader
          eyebrow="Boshqaruv"
          title="Foydalanuvchilar"
          description="Yaratish, rol/lavozim, parol reset, faollashtirish — oddiy roʻyxat."
        />

        <div className="mb-4">
          <Input
            label="Qidiruv"
            placeholder="Ism, email yoki rol..."
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
            <h3 className="font-display text-2xl">Yangi foydalanuvchi</h3>
            <Input
              label="Ism"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="h-12"
            />
            <Input
              label="Telefon (ixtiyoriy)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="h-12"
            />
            <Input
              label="Parol (min 8)"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
              className="h-12"
            />
            <Select
              label="Rol"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <Select
              label="Lavozim"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value as StaffPosition })}
            >
              <option value="">—</option>
              {(Object.keys(POSITION_LABELS) as StaffPosition[]).map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABELS[p]}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-full min-h-12">
              Yaratish
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
                      label="Ism"
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="h-11"
                    />
                    <Select
                      label="Rol"
                      value={edit.role}
                      onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}
                      disabled={u.id === me?.id}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Lavozim"
                      value={edit.position}
                      onChange={(e) => setEdit({ ...edit, position: e.target.value as StaffPosition })}
                    >
                      <option value="">—</option>
                      {(Object.keys(POSITION_LABELS) as StaffPosition[]).map((p) => (
                        <option key={p} value={p}>
                          {POSITION_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Telefon"
                      value={edit.phone}
                      onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                      className="h-11"
                    />
                    <Input
                      label="Yangi parol (boʻsh = oʻzgarmaydi)"
                      type="password"
                      value={edit.password}
                      onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                      minLength={8}
                      className="h-11"
                    />
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => saveEdit(u.id)}>
                        Saqlash
                      </Button>
                      <Button variant="secondary" onClick={() => setEditId(null)}>
                        Bekor
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
                        {u.telegramId && (
                          <p className="text-[11px] text-teal-700 mt-0.5">TG · {u.telegramId}</p>
                        )}
                      </div>
                      <span
                        className={
                          u.active
                            ? 'text-xs font-semibold text-teal-700'
                            : 'text-xs font-semibold text-rose-600'
                        }
                      >
                        {u.active ? 'Faol' : 'Oʻchirilgan'}
                      </span>
                    </div>
                    <p className="text-sm text-teal-800">{ROLE_LABELS[u.role as Role]}</p>
                    <select
                      className="w-full h-10 px-2 rounded-xl border border-teal-100 text-sm"
                      value={u.position || ''}
                      onChange={(e) => setPosition(u, e.target.value)}
                    >
                      <option value="">Lavozim —</option>
                      {(Object.keys(POSITION_LABELS) as StaffPosition[]).map((p) => (
                        <option key={p} value={p}>
                          {POSITION_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(u)}>
                        Tahrirlash
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(u)}
                        disabled={u.id === me?.id}
                      >
                        {u.active ? 'Oʻchirish' : 'Faollashtirish'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-ink-muted text-sm py-8">Foydalanuvchi topilmadi</p>
            )}
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
