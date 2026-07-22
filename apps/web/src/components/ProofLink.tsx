'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

/** Isbot faylini Authorization header bilan ochadi (JWT URLda emas) */
export function ProofLink({
  id,
  fileName,
  className,
}: {
  id: string;
  fileName: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const token = localStorage.getItem('klinikpi_token');
      const res = await fetch(`/api/staff/proofs/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(t('proof.fileOpenFailed'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      alert(t('proof.openFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={cn('text-xs text-teal-700 underline mr-2 disabled:opacity-50', className)}
    >
      {busy ? '...' : fileName}
    </button>
  );
}
