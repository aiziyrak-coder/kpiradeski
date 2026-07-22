'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Audit endi Hisobotlar ichida */
export default function AuditRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/reports?tab=audit');
  }, [router]);
  return null;
}
