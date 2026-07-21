'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { homeForRole } from '@/types';

/** Eski marshrutlar → rol bo‘yicha uy */
export default function RedirectLegacy() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    router.replace(homeForRole(user.role));
  }, [router, user, loading]);
  return (
    <div className="min-h-screen grid place-items-center text-ink-muted text-sm">
      Yoʻnaltirilmoqda...
    </div>
  );
}
