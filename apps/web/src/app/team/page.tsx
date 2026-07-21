'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button, Input, SectionHeader, Textarea, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { todayISO, POSITION_LABELS, type StaffPosition } from '@/types';
import { cn } from '@/lib/utils';
import { ProofLink } from '@/components/ProofLink';

const STATUS_UZ: Record<string, string> = {
  PENDING: 'Kutilmoqda',
  SUBMITTED: 'Tekshiruvda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Qaytarilgan',
  DONE: 'Bajarilgan',
};

const POSITIONS = Object.keys(POSITION_LABELS) as StaffPosition[];

function AutomationBanner() {
  const [info, setInfo] = useState<any>(null);
  useEffect(() => {
    api('/staff/automation')
      .then(setInfo)
      .catch(() => {});
  }, []);
  if (!info) return null;
  return (
    <div className="rounded-3xl border border-teal-100 bg-teal-50/60 p-5 mb-6 text-sm">
      <p className="font-semibold text-teal-900 mb-2">
        Kun avtomatik yangilanadi · {info.dayRollover || '06:00'} · {info.timezone}
      </p>
      <ul className="grid md:grid-cols-2 gap-1 text-ink-soft">
        {(info.schedule || []).map((s: string) => (
          <li key={s}>• {s}</li>
        ))}
      </ul>
    </div>
  );
}

export default function TeamPage() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [board, setBoard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userTasks, setUserTasks] = useState<any[]>([]);
  const [position, setPosition] = useState<StaffPosition | ''>('');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proofRequired, setProofRequired] = useState(true);
  const [weight, setWeight] = useState(10);
  const [recurring, setRecurring] = useState(true);
  const [assignBusy, setAssignBusy] = useState(false);
  const [panel, setPanel] = useState<null | { mode: 'edit' | 'reject'; task: any }>(null);
  const [panelNote, setPanelNote] = useState('');
  const [panelTitle, setPanelTitle] = useState('');
  const [panelDesc, setPanelDesc] = useState('');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthly, setMonthly] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const filteredUsers = useMemo(() => {
    if (!position) return users;
    return users.filter((u) => u.position === position || !u.position);
  }, [users, position]);

  const loadUserTasks = useCallback(async (uid: string) => {
    if (!uid) {
      setUserTasks([]);
      return;
    }
    try {
      setUserTasks(await api(`/staff/templates?userId=${uid}`));
    } catch {
      setUserTasks([]);
    }
  }, []);

  async function loadBoard() {
    try {
      const [b, u] = await Promise.all([api(`/staff/team?date=${date}`), api('/staff/users')]);
      setBoard(b);
      setUsers(u);
      if (!userId && u[0]) setUserId(u[0].id);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function loadMonthly() {
    try {
      setMonthly(await api(`/staff/monthly?year=${year}&month=${month}`));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => {
    loadBoard();
  }, [date]);

  useEffect(() => {
    loadMonthly();
  }, [year, month]);

  useEffect(() => {
    if (userId) loadUserTasks(userId);
  }, [userId, loadUserTasks]);

  useEffect(() => {
    if (position && userId) {
      const u = users.find((x) => x.id === userId);
      if (u && u.position && u.position !== position) {
        const match = users.find((x) => x.position === position);
        if (match) setUserId(match.id);
      }
    }
  }, [position, userId, users]);

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      toast.error('Xodim tanlang');
      return;
    }
    if (!position) {
      toast.error('Lavozim tanlang');
      return;
    }
    if (!title.trim()) {
      toast.error('Vazifa nomi kerak');
      return;
    }
    if (!description.trim()) {
      toast.error('Izoh kerak');
      return;
    }
    setAssignBusy(true);
    try {
      const res = await api('/staff/assign', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          position,
          title: title.trim(),
          description: description.trim(),
          proofRequired,
          weight,
          recurring,
        }),
      });
      toast.success(
        'Kunlik vazifa qoʻshildi',
        `«${res.task?.title}»${res.task?.recurring ? ' — har ish kuni 06:00' : ' — faqat bugun'}`,
      );
      setTitle('');
      setDescription('');
      await loadUserTasks(userId);
      await loadBoard();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAssignBusy(false);
    }
  }

  async function review(taskId: string, status: 'APPROVED' | 'REJECTED', reviewerNote = '') {
    try {
      await api(`/staff/tasks/${taskId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, reviewerNote }),
      });
      toast.success(status === 'APPROVED' ? 'Tasdiqlandi' : 'Qaytarildi');
      setPanel(null);
      await loadBoard();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function openReject(t: any) {
    setPanel({ mode: 'reject', task: t });
    setPanelNote('');
  }

  function openEdit(t: any) {
    setPanel({ mode: 'edit', task: t });
    setPanelTitle(t.title || '');
    setPanelDesc(t.description || '');
  }

  async function saveEdit() {
    if (!panel?.task) return;
    try {
      await api(`/staff/tasks/${panel.task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: panelTitle.trim(), description: panelDesc.trim() }),
      });
      toast.success('Vazifa yangilandi');
      setPanel(null);
      await loadBoard();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeTask(taskId: string, taskTitle: string) {
    if (!confirm(`«${taskTitle}» vazifasini oʻchirishni tasdiqlaysizmi?`)) return;
    try {
      await api(`/staff/tasks/${taskId}/delete`, { method: 'POST' });
      toast.success('Vazifa oʻchirildi');
      await loadBoard();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeUserTask(id: string, taskTitle: string) {
    if (
      !confirm(
        `«${taskTitle}» kunlik vazifasini oʻchirish? Kelgusi kunlarda avtomatik ochilmaydi.`,
      )
    )
      return;
    try {
      await api(`/staff/templates/${id}/delete`, { method: 'POST' });
      toast.success('Kunlik vazifa oʻchirildi');
      await loadUserTasks(userId);
      await loadBoard();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function evaluate() {
    setBusy(true);
    try {
      const res = await api('/staff/monthly/evaluate', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      });
      setMonthly({
        year,
        month,
        scores: res.results.map((r: any) => ({
          userId: r.user.id,
          totalScore: r.totalScore,
          breakdown: r.breakdown,
          aiSummary: r.aiSummary,
          user: r.user,
        })),
        leadershipReport: res.leadershipReport,
      });
      toast.success('Oylik KPI hisoblandi', 'AI xulosa tayyor');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedUser = users.find((u) => u.id === userId);

  return (
    <AppShell>
      <RoleGate allow={['MANAGER', 'DIRECTOR', 'SUPER_ADMIN', 'ADMIN']}>
        <SectionHeader
          eyebrow="Jamoa"
          title="Kunlik vazifalar"
          description="Har bir vazifa alohida kiritiladi (nom + izoh). Har ish kuni 06:00 da ochiladi. Dam olish kunlari hisoblanmaydi."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const r = await api('/staff/ai-daily', { method: 'POST' });
                    if (r.restDay) toast.success('Dam olish', r.message);
                    else toast.success('AI nazorat', `${r.members} xodim`);
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
              >
                AI nazorat
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const r = await api('/staff/automation/spawn', { method: 'POST' });
                    if (r.restDay) toast.success('Dam olish', r.reason || 'Vazifa ochilmaydi');
                    else toast.success('Vazifalar sync', `${r.created} yangi / ${r.staff} xodim`);
                    await loadBoard();
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
              >
                Bugunni ochish
              </Button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 px-3 rounded-xl border border-teal-200 bg-white text-sm"
              />
            </div>
          }
        />

        <AutomationBanner />

        {panel && (
          <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/40 p-3">
            <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-glow space-y-3 safe-bottom">
              {panel.mode === 'reject' ? (
                <>
                  <h3 className="font-display text-2xl">Qaytarish</h3>
                  <p className="text-sm text-ink-muted">{panel.task.title}</p>
                  <Textarea
                    label="Sabab (ixtiyoriy)"
                    value={panelNote}
                    onChange={(e) => setPanelNote(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => review(panel.task.id, 'REJECTED', panelNote)}
                    >
                      Qaytarish
                    </Button>
                    <Button variant="secondary" onClick={() => setPanel(null)}>
                      Bekor
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-display text-2xl">Vazifani tahrirlash</h3>
                  <Input
                    label="Nomi"
                    value={panelTitle}
                    onChange={(e) => setPanelTitle(e.target.value)}
                  />
                  <Textarea
                    label="Tavsif"
                    value={panelDesc}
                    onChange={(e) => setPanelDesc(e.target.value)}
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={saveEdit}>
                      Saqlash
                    </Button>
                    <Button variant="secondary" onClick={() => setPanel(null)}>
                      Bekor
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={onAssign}
          className="rounded-3xl border border-teal-100 bg-white/90 p-6 shadow-soft mb-8 space-y-5"
        >
          <div>
            <h3 className="font-display text-2xl text-teal-950">Kunlik vazifa qoʻshish</h3>
            <p className="text-sm text-ink-muted mt-1">
              Xodim, lavozim va bitta vazifa (nom + izoh). Har kuni alohida vazifa kiritiladi.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Select
              label="Lavozim"
              value={position}
              onChange={(e) => setPosition(e.target.value as StaffPosition | '')}
              required
            >
              <option value="">Lavozimni tanlang...</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABELS[p]}
                </option>
              ))}
            </Select>

            <Select
              label="Xodim"
              value={userId}
              onChange={(e) => {
                const id = e.target.value;
                setUserId(id);
                const u = users.find((x) => x.id === id);
                if (u?.position) setPosition(u.position);
              }}
              required
            >
              <option value="">Xodimni tanlang...</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.position
                    ? ` · ${POSITION_LABELS[u.position as StaffPosition] || u.position}`
                    : ' · lavozimsiz'}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Vazifa nomi"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masalan: Kunlik ombor inventarizatsiya"
            required
          />
          <Textarea
            label="Izoh / tavsif"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nima qilish kerak, qanday isbot..."
            rows={4}
            required
          />
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <Input
              label="Ball (weight)"
              type="number"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 10)}
            />
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm h-11">
                <input
                  type="checkbox"
                  checked={proofRequired}
                  onChange={(e) => setProofRequired(e.target.checked)}
                />
                Isbot majburiy
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                />
                Har ish kuni takrorlanadi (06:00)
              </label>
            </div>
          </div>

          <Button type="submit" disabled={assignBusy} className="w-full md:w-auto">
            {assignBusy ? 'Saqlanmoqda...' : 'Vazifani saqlash'}
          </Button>
        </form>

        {selectedUser && userTasks.length > 0 && (
          <section className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft mb-8">
            <h3 className="font-display text-xl text-teal-950 mb-1">
              {selectedUser.name} — kunlik vazifalar roʻyxati
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              Har ish kuni 06:00 da avtomatik ochiladigan vazifalar
            </p>
            <div className="space-y-2">
              {userTasks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-teal-50 px-4 py-3 flex flex-wrap justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="text-xs text-ink-muted mt-1">{t.description}</p>
                    <p className="text-[11px] text-teal-700 mt-1">
                      {t.weight} ball · {t.proofRequired ? 'isbot kerak' : 'isbotsiz'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => removeUserTask(t.id, t.title)}
                  >
                    Oʻchirish
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {board?.restDay && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 mb-8 text-center">
            <p className="font-display text-2xl text-amber-950">Dam olish kuni</p>
            <p className="text-sm text-amber-900/80 mt-2">{board.reason}</p>
          </div>
        )}

        <div className="space-y-5 mb-10">
          {(board?.members || []).length === 0 && (
            <div className="rounded-3xl border border-teal-100 bg-white/80 p-8 text-center text-ink-muted">
              Hali lavozimli xodim yoʻq. Avval <strong>/users</strong> orqali xodim qoʻshing va
              shu yerda vazifa biriktiring.
            </div>
          )}
          {(board?.members || []).map((m: any) => (
            <section
              key={m.user.id}
              className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft"
            >
              <div className="flex flex-wrap justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-display text-2xl">{m.user.name}</h3>
                  <p className="text-sm text-ink-muted">{m.user.positionLabel}</p>
                </div>
                <p className="text-sm font-semibold text-teal-800">
                  {m.stats.completionPct}% · {m.stats.approved} tasdiq / {m.stats.submitted}{' '}
                  tekshiruv / {m.stats.pending} kutish
                </p>
              </div>
              <div className="space-y-3">
                {m.tasks.map((t: any) => (
                  <div
                    key={t.id}
                    className={cn(
                      'rounded-2xl border p-3',
                      t.status === 'SUBMITTED' ? 'border-amber-200 bg-amber-50/50' : 'border-teal-50',
                    )}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{t.title}</p>
                        <p className="text-xs text-ink-muted">
                          {STATUS_UZ[t.status] || t.status}
                          {t.description ? ` · ${t.description.slice(0, 80)}` : ''}
                        </p>
                        {(t.proofs || []).map((p: any) => (
                          <ProofLink key={p.id} id={p.id} fileName={p.fileName} />
                        ))}
                      </div>
                      {t.status === 'SUBMITTED' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => review(t.id, 'APPROVED')}>
                            Tasdiqlash
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openReject(t)}>
                            Qaytarish
                          </Button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>
                          Tahrirlash
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => removeTask(t.id, t.title)}>
                          Oʻchirish
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <SectionHeader
          eyebrow="Oy oxiri"
          title="Xodimlar 100 ballik KPI"
          description="Bajarilish + isbot + tasdiq + vaqtida topshirish."
          action={
            <Button disabled={busy} onClick={evaluate}>
              {busy ? 'Hisoblanmoqda...' : 'Oylik baholash'}
            </Button>
          }
        />

        <div className="flex gap-3 mb-4">
          <Input
            label="Yil"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <Input
            label="Oy"
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {(monthly?.scores || []).map((s: any) => (
            <article
              key={s.userId || s.user?.id}
              className="rounded-3xl border border-teal-100 bg-white/80 p-5 shadow-soft"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-semibold">{s.user?.name}</h3>
                  <p className="text-xs text-ink-muted">{s.user?.positionLabel}</p>
                </div>
                <p className="font-display text-4xl text-teal-800">{s.totalScore}</p>
              </div>
              <p className="text-xs text-ink-muted mt-2 whitespace-pre-wrap">
                {s.aiSummary || JSON.stringify(s.breakdown)}
              </p>
            </article>
          ))}
        </div>

        {monthly?.leadershipReport && (
          <div className="rounded-3xl border border-teal-100 bg-teal-50/50 p-6 whitespace-pre-wrap text-sm">
            {monthly.leadershipReport}
          </div>
        )}
      </RoleGate>
    </AppShell>
  );
}
