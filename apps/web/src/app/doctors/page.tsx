'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate, canWrite } from '@/components/RoleGate';
import { Button, Input, SectionHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { todayISO, weekStartISO } from '@/types';
import { cn } from '@/lib/utils';

export default function DoctorsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const writable = user ? canWrite(user.role, ['ADMIN', 'MANAGER', 'SUPER_ADMIN']) : false;
  const managerWrite = user ? canWrite(user.role, ['MANAGER', 'SUPER_ADMIN']) : false;

  const [date, setDate] = useState(todayISO());
  const [doctors, setDoctors] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [stories, setStories] = useState<Record<string, boolean>>({});
  const [referrals, setReferrals] = useState<Record<string, number>>({});
  const [weekStart, setWeekStart] = useState(weekStartISO());
  const [mystery, setMystery] = useState({ booked: true, note: '' });
  const [mysteryList, setMysteryList] = useState<any[]>([]);
  const [newDoctor, setNewDoctor] = useState({ name: '', specialty: '' });

  async function load() {
    try {
      const [docs, rank, day, myst, refs] = await Promise.all([
        api('/doctors'),
        api('/doctors/ranking'),
        api(`/kpi/day?date=${date}`),
        api('/kpi/mystery').catch(() => []),
        api(`/kpi/doctor-referrals?weekStart=${weekStart}`).catch(() => []),
      ]);
      setDoctors(docs);
      setRanking(rank);
      setMysteryList(myst);
      const s: Record<string, boolean> = {};
      const r: Record<string, number> = {};
      docs.forEach((d: any) => {
        s[d.id] = false;
        r[d.id] = 0;
      });
      (day.stories || []).forEach((st: any) => {
        s[st.doctorId] = st.posted;
      });
      (refs || []).forEach((ref: any) => {
        r[ref.doctorId] = ref.patientsCount ?? 0;
      });
      setStories(s);
      setReferrals(r);
    } catch (e: any) {
      toast.error('Yuklash xatosi', e.message);
    }
  }

  useEffect(() => {
    load();
  }, [date, weekStart]);

  async function saveStories() {
    try {
      const entries = Object.entries(stories).map(([doctorId, posted]) => ({ doctorId, posted }));
      await api('/kpi/doctor-stories', { method: 'POST', body: JSON.stringify({ date, entries }) });
      toast.success('Stories saqlandi');
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    }
  }

  async function saveReferrals() {
    try {
      const entries = Object.entries(referrals).map(([doctorId, patientsCount]) => ({
        doctorId,
        patientsCount: Number(patientsCount),
      }));
      await api('/kpi/doctor-referrals', {
        method: 'POST',
        body: JSON.stringify({ weekStart, entries }),
      });
      toast.success('Yoʻnaltirishlar saqlandi');
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    }
  }

  async function saveMystery() {
    try {
      await api('/kpi/mystery', {
        method: 'POST',
        body: JSON.stringify({ date, ...mystery }),
      });
      toast.success('Maxfiy bemor testi saqlandi');
      await load();
    } catch (e: any) {
      toast.error('Saqlanmadi', e.message);
    }
  }

  async function createDoctor() {
    try {
      await api('/doctors', { method: 'POST', body: JSON.stringify(newDoctor) });
      setNewDoctor({ name: '', specialty: '' });
      toast.success('Shifokor qoʻshildi');
      await load();
    } catch (e: any) {
      toast.error('Qoʻshilmadi', e.message);
    }
  }

  async function toggleDoctor(d: any) {
    try {
      await api(`/doctors/${d.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !d.active }),
      });
      toast.success(d.active ? 'Nofaol qilindi' : 'Faollashtirildi');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const activeDoctors = doctors.filter((d) => d.active !== false);

  return (
    <AppShell>
      <RoleGate allow={['ADMIN', 'MANAGER', 'DIRECTOR', 'SUPER_ADMIN']}>
        <SectionHeader
          eyebrow="Shifokorlar"
          title="Faollik va yoʻnaltirish"
          description="Stories, yoʻnaltirishlar va maxfiy bemor — ball hisobiga kiradi."
          action={
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 px-3 rounded-xl border border-teal-200 bg-white/90 text-sm"
            />
          }
        />

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
            <h3 className="font-display text-2xl mb-4">Kunlik Instagram stories</h3>
            <div className="space-y-2">
              {activeDoctors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={!writable}
                  onClick={() => writable && setStories((s) => ({ ...s, [d.id]: !s[d.id] }))}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-3 rounded-xl border text-sm transition touch-target',
                    stories[d.id] ? 'bg-teal-50 border-teal-200' : 'border-teal-50 hover:bg-sand-50',
                    !writable && 'opacity-70 cursor-default',
                  )}
                >
                  <span>
                    <span className="font-medium block">{d.name}</span>
                    <span className="text-xs text-ink-muted">{d.specialty}</span>
                  </span>
                  <span className="text-teal-700 font-semibold">{stories[d.id] ? 'Ha' : 'Yoʻq'}</span>
                </button>
              ))}
              {activeDoctors.length === 0 && (
                <p className="text-sm text-ink-muted">Faol shifokor yoʻq — pastda qoʻshing.</p>
              )}
            </div>
            {writable && (
              <Button className="mt-4 w-full" onClick={saveStories}>
                Saqlash
              </Button>
            )}
          </div>

          <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
            <div className="flex items-center justify-between mb-4 gap-3">
              <h3 className="font-display text-2xl">Haftalik yoʻnaltirishlar</h3>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="h-9 px-2 rounded-lg border border-teal-200 text-sm"
                disabled={!managerWrite}
              />
            </div>
            <div className="space-y-3">
              {activeDoctors.map((d) => (
                <Input
                  key={d.id}
                  label={d.name}
                  type="number"
                  min={0}
                  disabled={!managerWrite}
                  value={referrals[d.id] || 0}
                  onChange={(e) => setReferrals((r) => ({ ...r, [d.id]: Number(e.target.value) }))}
                />
              ))}
            </div>
            {managerWrite && (
              <Button className="mt-4 w-full" onClick={saveReferrals}>
                Saqlash
              </Button>
            )}
          </div>

          <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
            <h3 className="font-display text-2xl mb-4">Reyting</h3>
            <div className="space-y-2">
              {ranking.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-2xl bg-sand-50">
                  <span className="w-7 h-7 rounded-full bg-teal-700 text-white text-xs grid place-items-center font-semibold">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-ink-muted">
                      Stories {d.storyRate}% · Yoʻnaltirish {d.referrals}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft">
              <h3 className="font-display text-2xl mb-2">Maxfiy bemor testi</h3>
              <p className="text-sm text-ink-muted mb-4">Har 2 haftada · ball hisobiga taʼsir qiladi</p>
              {managerWrite ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMystery((m) => ({ ...m, booked: !m.booked }))}
                    className={cn(
                      'w-full text-left px-3 py-3 rounded-xl border text-sm mb-3',
                      mystery.booked ? 'bg-teal-50 border-teal-200' : 'border-rose-200 bg-rose-50',
                    )}
                  >
                    {mystery.booked ? '✓ Yozildi' : '○ Yozilmadi'}
                  </button>
                  <Input
                    label="Izoh"
                    value={mystery.note}
                    onChange={(e) => setMystery({ ...mystery, note: e.target.value })}
                  />
                  <Button className="mt-3 w-full" onClick={saveMystery}>
                    Natijani saqlash
                  </Button>
                </>
              ) : (
                <p className="text-sm text-ink-muted">Faqat menejer / super-admin kiritadi</p>
              )}
              <div className="mt-4 space-y-1 max-h-40 overflow-y-auto">
                {mysteryList.map((m) => (
                  <p key={m.id} className="text-sm text-ink-soft">
                    {String(m.date).slice(0, 10)} · {m.booked ? 'Yozildi' : 'Yozilmadi'} · {m.admin?.name}
                  </p>
                ))}
              </div>
            </div>

            {managerWrite && (
              <div className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft space-y-3">
                <h3 className="font-display text-2xl">Yangi shifokor</h3>
                <Input
                  label="Ism"
                  value={newDoctor.name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })}
                />
                <Input
                  label="Mutaxassislik"
                  value={newDoctor.specialty}
                  onChange={(e) => setNewDoctor({ ...newDoctor, specialty: e.target.value })}
                />
                <Button className="w-full min-h-12" disabled={!newDoctor.name} onClick={createDoctor}>
                  Qoʻshish
                </Button>

                <div className="border-t border-teal-50 pt-4 space-y-2">
                  <p className="text-sm font-semibold">Roʻyxat</p>
                  {doctors.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-sm py-2 border-b border-teal-50"
                    >
                      <div>
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-ink-muted">
                          {d.specialty || '—'} · {d.active === false ? 'Nofaol' : 'Faol'}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => toggleDoctor(d)}>
                        {d.active === false ? 'Faollashtirish' : 'Nofaol'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </RoleGate>
    </AppShell>
  );
}
