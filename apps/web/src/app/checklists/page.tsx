'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { homeForRole } from '@/types';

/** Eski marshrutlar → rol bo‘yicha uy */
export default function RedirectLegacy() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useI18n();
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
      {t('common.redirecting')}
    </div>
  );
}
