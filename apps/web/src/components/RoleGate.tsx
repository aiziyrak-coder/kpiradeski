'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Role } from '@/types';

export function RoleGate({
  allow,
  children,
  fallback,
}: {
  allow: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { t, roleLabel } = useI18n();

  if (loading) {
    return (
      <div className="h-40 grid place-items-center text-ink-muted text-sm">
        {t('common.checking')}
      </div>
    );
  }

  if (!user) return null;

  if (user.role === 'SUPER_ADMIN' || allow.includes(user.role)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  return (
    <div className="rounded-3xl border border-rose-100 bg-rose-50/60 p-8 text-center">
      <p className="font-display text-2xl text-ink">{t('common.forbidden')}</p>
      <p className="text-sm text-ink-muted mt-2">
        {t('common.forbiddenHint', { role: roleLabel(user.role) })}
      </p>
      <Link
        href="/dashboard"
        className="inline-block mt-4 text-sm text-teal-700 font-semibold underline"
      >
        {t('common.backToDashboard')}
      </Link>
    </div>
  );
}

export function canWrite(role: Role, writers: Role[] = ['ADMIN', 'MANAGER']) {
  if (role === 'SUPER_ADMIN' && writers.some((r) => r !== 'STAFF')) return true;
  return writers.includes(role);
}
