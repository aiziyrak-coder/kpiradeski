'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTelegram } from '@/components/TelegramProvider';
import { homeForRole } from '@/types';

const START_ROUTES = ['dashboard', 'today', 'assistant', 'reports', 'my', 'notifications'];

export default function Home() {
  const { user, loading } = useAuth();
  const { webApp } = useTelegram();
  const router = useRouter();

  // Mini App t.me/<bot>?startapp=<route> bilan ochilgan boʻlsa — shu sahifaga
  const raw = webApp?.initDataUnsafe?.start_param;
  const startRoute = raw && START_ROUTES.includes(raw) ? `/${raw}` : null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    router.replace(startRoute || homeForRole(user.role));
  }, [user, loading, router, startRoute]);

  return (
    <div className="min-h-screen grid place-items-center bg-mesh">
      <div className="w-10 h-10 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
    </div>
  );
}
