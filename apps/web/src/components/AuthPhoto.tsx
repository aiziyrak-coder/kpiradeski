'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/api';

export function AuthPhoto({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    let obj: string | null = null;
    const token = getToken();
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        obj = URL.createObjectURL(b);
        if (!gone) setUrl(obj);
      })
      .catch(() => {
        if (!gone) setUrl(null);
      });
    return () => {
      gone = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [src]);
  if (!url) {
    return (
      <div className={className}>
        <span className="text-[10px] text-ink-muted">…</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
