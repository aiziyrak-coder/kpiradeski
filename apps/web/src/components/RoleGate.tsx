'use client';

import { useAuth } from '@/lib/auth';
import type { Role } from '@/types';
import Link from 'next/link';

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

  if (loading) {
    return (
      <div className="h-40 grid place-items-center text-ink-muted text-sm">Tekshirilmoqda...</div>
    );
  }

  if (!user) return null;

  if (user.role === 'SUPER_ADMIN' || allow.includes(user.role)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  return (
    <div className="rounded-3xl border border-rose-100 bg-rose-50/60 p-8 text-center">
      <p className="font-display text-2xl text-ink">Ruxsat yoʻq</p>
      <p className="text-sm text-ink-muted mt-2">
        Bu boʻlim uchun sizning rolingiz ({user.role}) yetarli emas.
      </p>
      <Link href="/dashboard" className="inline-block mt-4 text-sm text-teal-700 font-semibold underline">
        Dashboardga qaytish
      </Link>
    </div>
  );
}

export function canWrite(role: Role, writers: Role[] = ['ADMIN', 'MANAGER']) {
  // Super Admin boshqaruv ekranlarida yozishi mumkin (kunlik STAFF vazifalaridan tashqari UI)
  if (role === 'SUPER_ADMIN' && writers.some((r) => r !== 'STAFF')) return true;
  return writers.includes(role);
}
