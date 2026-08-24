'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ScanFace, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { AuthPhoto } from '@/components/AuthPhoto';
import { cn } from '@/lib/utils';

type Emp = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  expectedArrive: string;
  expectedLeave?: string | null;
  position?: string | null;
  hasPhoto?: boolean;
  status: 'PENDING' | 'ON_TIME' | 'LATE' | 'ABSENT';
  arrivedLabel: string | null;
};

function frameDiff(a: ImageData, b: ImageData) {
  const step = 16;
  let s = 0;
  let n = 0;
  const len = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < len; i += step) {
    const ga = a.data[i] * 0.3 + a.data[i + 1] * 0.59 + a.data[i + 2] * 0.11;
    const gb = b.data[i] * 0.3 + b.data[i + 1] * 0.59 + b.data[i + 2] * 0.11;
    s += Math.abs(ga - gb);
    n += 1;
  }
  return n ? s / n : 0;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.82);
  });
}

export function AttendancePanel({
  branchId,
  date,
  onChanged,
}: {
  branchId: string;
  date: string;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [board, setBoard] = useState<any>(null);
  const [scanEmp, setScanEmp] = useState<Emp | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    const d = await api(`/attendance/day?branchId=${branchId}&date=${date}`);
    setBoard(d);
  }, [branchId, date]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  async function startCam() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    return () => stopCam();
  }, []);

  async function openScan(emp: Emp) {
    setScanEmp(emp);
    setHint(t('employees.lookAtCam'));
    try {
      await startCam();
    } catch {
      toast.error(t('employees.camFail'));
      setScanEmp(null);
    }
  }

  async function runScan() {
    const video = videoRef.current;
    const emp = scanEmp;
    if (!video || !emp) return;
    setBusy(true);
    try {
      const w = 360;
      const h = 360;
      const c1 = document.createElement('canvas');
      const c2 = document.createElement('canvas');
      c1.width = c2.width = w;
      c1.height = c2.height = h;
      const ctx1 = c1.getContext('2d', { willReadFrequently: true })!;
      const ctx2 = c2.getContext('2d', { willReadFrequently: true })!;
      ctx1.drawImage(video, 0, 0, w, h);
      const first = ctx1.getImageData(0, 0, w, h);
      setHint(t('employees.turnHead'));
      await new Promise((r) => setTimeout(r, 1400));
      ctx2.drawImage(video, 0, 0, w, h);
      const second = ctx2.getImageData(0, 0, w, h);
      const diff = frameDiff(first, second);
      if (diff < 5.5) {
        throw new Error(t('employees.notLive'));
      }
      const blob1 = await canvasToBlob(c1);
      const blob2 = await canvasToBlob(c2);
      const fd = new FormData();
      fd.append('employeeId', emp.id);
      fd.append('branchId', branchId);
      fd.append('date', date);
      fd.append('live', new File([blob1], 'live.jpg', { type: 'image/jpeg' }));
      fd.append('live2', new File([blob2], 'live2.jpg', { type: 'image/jpeg' }));
      const token = getToken();
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('common.error'));
      toast.success(
        data.late
          ? `${data.name}: ${t('employees.late')} · ${data.arrivedLabel}`
          : `${data.name}: ${t('employees.onTime')} · ${data.arrivedLabel}`,
      );
      stopCam();
      setScanEmp(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    } finally {
      setBusy(false);
      setHint(t('employees.lookAtCam'));
    }
  }

  const rows: Emp[] = board?.employees || [];
  const statusCls = (s: Emp['status']) =>
    s === 'ON_TIME'
      ? 'bg-emerald-100 text-emerald-900'
      : s === 'LATE'
        ? 'bg-amber-100 text-amber-900'
        : s === 'ABSENT'
          ? 'bg-rose-100 text-rose-900'
          : 'bg-sand-100 text-ink-muted';

  const statusText = (s: Emp['status']) =>
    s === 'ON_TIME'
      ? t('employees.onTime')
      : s === 'LATE'
        ? t('employees.late')
        : s === 'ABSENT'
          ? t('employees.absent')
          : t('employees.pending');

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-ink-muted">{t('employees.scanHint')}</p>
      {board && (
        <p className="text-xs font-semibold text-teal-900">
          {t('employees.arrivedCount')
            .replace('{n}', String(board.arrived))
            .replace('{t}', String(board.total))}
        </p>
      )}
      <div className="space-y-2">
        {rows.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2.5 rounded-xl border border-teal-100 bg-white p-2"
          >
            <AuthPhoto
              src={`/api/attendance/employees/${e.id}/photo`}
              alt={e.name}
              className="w-12 h-12 rounded-lg object-cover bg-sand-100 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm leading-snug">{e.name}</p>
              {e.position && (
                <p className="text-[10px] text-ink-muted">{e.position}</p>
              )}
              <p className="text-[11px] text-ink-muted">
                {t('employees.expected')}: {e.expectedArrive}
                {e.expectedLeave ? `–${e.expectedLeave}` : ''}
                {e.arrivedLabel ? ` · ${t('employees.arrived')}: ${e.arrivedLabel}` : ''}
              </p>
              {!e.hasPhoto && (
                <p className="text-[10px] text-amber-800">{t('employees.noPhoto')}</p>
              )}
            </div>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', statusCls(e.status))}>
              {statusText(e.status)}
            </span>
            {e.status !== 'ON_TIME' && e.status !== 'LATE' && (
              <button
                type="button"
                onClick={() => openScan(e)}
                className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-semibold bg-teal-800 text-white"
              >
                <ScanFace className="w-3.5 h-3.5" />
                {t('employees.scan')}
              </button>
            )}
          </div>
        ))}
        {!rows.length && (
          <p className="text-sm text-ink-muted py-4 text-center">{t('employees.emptyBranch')}</p>
        )}
      </div>

      {scanEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{scanEmp.name}</p>
              <button
                type="button"
                onClick={() => {
                  stopCam();
                  setScanEmp(null);
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full aspect-square rounded-xl bg-black object-cover"
            />
            <p className="text-sm text-center text-teal-900 font-medium">{hint}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => runScan()}
              className="w-full h-11 rounded-xl bg-teal-800 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              {busy ? t('employees.checkingLive') : t('employees.scanNow')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
