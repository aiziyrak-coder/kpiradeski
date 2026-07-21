'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Input, SectionHeader, Textarea } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { formatTashkent, todayISO, userPositionLabel } from '@/types';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ProofLink } from '@/components/ProofLink';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Kutilmoqda',
  SUBMITTED: 'Tekshiruvda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Qaytarilgan',
};

export default function MyPage() {
  const toast = useToast();
  const { t, lang } = useI18n();
  const [date, setDate] = useState(todayISO());
  const [profile, setProfile] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [restDay, setRestDay] = useState(false);
  const [restReason, setRestReason] = useState('');

  async function load() {
    try {
      const [p, t] = await Promise.all([
        api('/staff/me'),
        api(`/staff/my-tasks?date=${date}`),
      ]);
      setProfile(p);
      setBio(p.bio || '');
      setPhone(p.phone || '');
      if (Array.isArray(t)) {
        setTasks(t);
        setRestDay(false);
        setRestReason('');
      } else {
        setTasks(t.tasks || []);
        setRestDay(!!t.restDay);
        setRestReason(t.reason || 'Dam olish kuni');
      }
    } catch (e: any) {
      toast.error('Yuklanmadi', e.message);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      const p = await api('/staff/me', {
        method: 'PATCH',
        body: JSON.stringify({ bio, phone }),
      });
      setProfile(p);
      toast.success('Profil saqlandi');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function uploadProof(taskId: string, file: File) {
    setBusy(taskId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('klinikpi_token');
      const res = await fetch(`/api/staff/tasks/${taskId}/proof`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Yuklash xatosi');
      toast.success('Isbot yuklandi', 'Vazifa tekshiruvga yuborildi');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function submitTask(taskId: string) {
    setBusy(taskId);
    try {
      await api(`/staff/tasks/${taskId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ employeeNote: notes[taskId] || '' }),
      });
      toast.success('Yuborildi');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  const done = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'SUBMITTED').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Shaxsiy kabinet"
        title="Mening profilingiz"
        description="Kunlik vazifalar, isbot yuklash va oylik KPI uchun asos."
        action={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 px-3 rounded-xl border border-teal-200 bg-white/90 text-sm"
          />
        }
      />

      {restDay && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 mb-6 text-sm text-amber-950">
          <p className="font-semibold">Dam olish kuni</p>
          <p className="mt-1 text-amber-900/80">{restReason}. Bugun vazifa yoʻq va hisoblanmaydi.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-1 rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
          <div className="w-16 h-16 rounded-2xl bg-teal-700 text-white grid place-items-center font-display text-3xl mb-3">
            {(profile?.name || '?').slice(0, 1)}
          </div>
          <h3 className="font-display text-2xl">{profile?.name}</h3>
          <p className="text-sm text-teal-800 mt-1">
            {userPositionLabel(profile || {}, lang) || t('my.noPosition')}
          </p>
          <p className="text-xs text-ink-muted mt-1">{profile?.email}</p>
          <form onSubmit={saveProfile} className="mt-4 space-y-3">
            <Input label="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Textarea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
            <Button type="submit" className="w-full" variant="secondary">
              Profilni saqlash
            </Button>
          </form>
        </div>

        <div className="lg:col-span-2 rounded-3xl bg-gradient-to-br from-teal-800 to-teal-950 text-white p-6 shadow-glow">
          <p className="text-teal-100/80 text-sm">Bugungi bajarilish</p>
          <p className="font-display text-6xl mt-1">{pct}%</p>
          <p className="text-teal-100 mt-2">
            {done}/{tasks.length} vazifa · {date}
          </p>
          {!profile?.positionId && (
            <p className="mt-4 text-sm text-amber-200">{t('my.noPositionHint')}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {tasks.length === 0 && (
          <div className="rounded-3xl border border-dashed border-teal-200 p-10 text-center text-ink-muted">
            Bugun uchun vazifa yoʻq yoki lavozim biriktirilmagan.
          </div>
        )}
        {tasks.map((t) => (
          <article
            key={t.id}
            className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-lg">{t.title}</h3>
                <p className="text-sm text-ink-muted mt-1">{t.description}</p>
              </div>
              <span
                className={cn(
                  'text-xs font-semibold px-2.5 py-1 rounded-lg',
                  t.status === 'APPROVED' && 'bg-emerald-50 text-emerald-800',
                  t.status === 'SUBMITTED' && 'bg-amber-50 text-amber-800',
                  t.status === 'PENDING' && 'bg-slate-100 text-slate-700',
                  t.status === 'REJECTED' && 'bg-rose-50 text-rose-800',
                )}
              >
                {STATUS_LABEL[t.status] || t.status}
              </span>
            </div>

            {t.reviewerNote && (
              <p className="mt-3 text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">
                Tekshiruvchi: {t.reviewerNote}
              </p>
            )}

            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <Textarea
                label="Izoh (ixtiyoriy)"
                rows={2}
                value={notes[t.id] || t.employeeNote || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                disabled={t.status === 'APPROVED'}
              />
              <div className="space-y-2">
                <label className="text-sm text-ink-muted block">
                  Isbot yuklash {t.proofRequired ? '(majburiy)' : ''}
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={t.status === 'APPROVED' || busy === t.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadProof(t.id, f);
                  }}
                  className="block w-full text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {(t.proofs || []).map((p: any) => (
                    <ProofLink key={p.id} id={p.id} fileName={p.fileName} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <Button
                disabled={busy === t.id || t.status === 'APPROVED'}
                onClick={() => submitTask(t.id)}
              >
                {busy === t.id ? '...' : 'Tekshiruvga yuborish'}
              </Button>
              {t.submittedAt && (
                <span className="text-xs text-ink-muted">
                  Yuborilgan: {formatTashkent(t.submittedAt)}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
