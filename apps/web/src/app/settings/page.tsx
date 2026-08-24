'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Eski /settings → /integrations */
export default function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/integrations');
  }, [router]);
  return (
    <div className="p-8 text-center text-ink-muted text-sm">...</div>
  );
}
